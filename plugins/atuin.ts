/**
 * Repository-managed Atuin adapter for OpenCode v2.
 *
 * Tracks shell commands executed by opencode in Atuin history with author
 * `opencode`.
 *
 * Already included in this global configuration; no hook installer is needed.
 * Do not run `atuin hook install opencode` over this managed file: the upstream
 * installer can replace it with its bundled plugin. Update through this
 * checkout and restart OpenCode. See README.md for setup guidance.
 */

import { Plugin } from "@opencode/plugin";
import type { EventDomain } from "@opencode/plugin/promise/event";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { isShellTool } from "../lib/shell-command.ts";
import { shellWorkingDirectory } from "../lib/shell-workdir.ts";

const ATUIN_AUTHOR = "opencode";
const ATUIN_TIMEOUT_MS = 10_000;
const MAX_EARLY_EXITS = 128;

// A command that did not exit on its own reports a null exit code, so
// substitute the conventional code for each of the two ways that happens.
const EXIT_ABORTED = 130;
const EXIT_TIMED_OUT = 124;

interface Entry {
	historyId: string;
	cwd: string;
}

interface AtuinResult {
	code: number | null;
	stdout: string;
	spawnError?: string;
}

/**
 * Run Atuin, resolving rather than rejecting on every failure.
 *
 * Spawned without a shell: a recorded command is arbitrary text that has to
 * reach Atuin as a single argv entry unmangled, which rules out the Bun shell
 * the plugin API hands us.
 */
function atuin(args: string[], cwd: string): Promise<AtuinResult> {
	return new Promise((resolve) => {
		let child: ReturnType<typeof spawn>;
		try {
			// Atuin prefers PWD to the process directory when recording history.
			child = spawn("atuin", args, { cwd, env: { ...process.env, PWD: cwd }, stdio: ["ignore", "pipe", "ignore"] });
		} catch {
			resolve({ code: null, stdout: "" });
			return;
		}

		let stdout = "";
		let settled = false;
		const timer = setTimeout(() => child.kill("SIGKILL"), ATUIN_TIMEOUT_MS);

		const settle = (result: AtuinResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(result);
		};

		child.stdout?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.on("error", (error: NodeJS.ErrnoException) =>
			settle({ code: null, stdout: "", spawnError: error.code }),
		);
		child.on("close", (code) => settle({ code, stdout }));
	});
}

async function startHistory(
	cwd: string,
	command: string,
	intent: unknown,
): Promise<string | undefined> {
	const args = [
		"history",
		"start",
		"--author",
		ATUIN_AUTHOR,
		"--author-kind",
		"agent",
	];
	if (typeof intent === "string" && intent.length > 0) args.push("--intent", intent);
	args.push("--", command);

	const result = await atuin(args, cwd);
	if (result.code !== 0) return undefined;

	const historyId = result.stdout.trim();
	return historyId.length > 0 ? historyId : undefined;
}

async function endHistory(entry: Entry, exit: number): Promise<void> {
  const args = ["history", "end", entry.historyId, "--exit", String(exit)];
  const result = await atuin(args, entry.cwd);
  // ENOENT may mean the command removed or renamed its working directory.
  if (result.spawnError === "ENOENT") await atuin(args, homedir());
}

interface ShellResult {
  content?: unknown;
  metadata?: { exit?: unknown; timeout?: unknown; status?: unknown; shellID?: unknown };
}

function outputText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter(block => block?.type === "text").map(block => block.text).join("\n");
}

function exitCodeFrom(result: ShellResult): number {
  const { timeout, exit } = result.metadata ?? {};
  if (typeof timeout === "boolean" && timeout) return EXIT_TIMED_OUT;
  if (typeof exit === "number") return exit;

  // Older shell results report timeout and interruption in the output text.
  const text = outputText(result.content);
	if (text.includes("User aborted the command")) return EXIT_ABORTED;
	if (/exceeding timeout \d+ ms/.test(text)) return EXIT_TIMED_OUT;
	return 1;
}

function rememberExit(exits: Map<string, number>, id: string, code: number): void {
  // A short-lived shell can exit before its background handle reaches the after hook.
  exits.set(id, code);
  if (exits.size > MAX_EARLY_EXITS) exits.delete(exits.keys().next().value);
}

function subscribeToShellExits(eventBus: EventDomain, onExit: (id: string, code: number) => Promise<void>): () => void {
  const controller = new AbortController();
  const events = eventBus.subscribe({ signal: controller.signal });
  void swallowFailures(async () => {
    for await (const event of events) {
      if (event.type !== "shell.exited" || event.data.status === "running") continue;
      const { id, status, exit } = event.data;
      await onExit(id, status === "timeout" ? EXIT_TIMED_OUT : (exit ?? 1));
    }
  });
  return () => controller.abort();
}

function trackBackground(eventBus: EventDomain, running: Map<string, Entry>) {
  const waiting = new Map<string, Entry>();
  const earlyExits = new Map<string, number>();
  const unsubscribe = subscribeToShellExits(eventBus, async (id, code) => {
    const entry = waiting.get(id);
    if (entry) {
      waiting.delete(id);
      await endHistory(entry, code);
    } else if (running.size > 0) rememberExit(earlyExits, id, code);
  });
  return {
    async finish(entry: Entry, result: ShellResult): Promise<void> {
      const { status, shellID } = result.metadata ?? {};
      if (status !== "running") return endHistory(entry, exitCodeFrom(result));
      if (typeof shellID !== "string") return;
      const code = earlyExits.get(shellID);
      if (code === undefined) {
        waiting.set(shellID, entry);
        return;
      }
      earlyExits.delete(shellID);
      await endHistory(entry, code);
    },
    close(): void {
      unsubscribe();
      waiting.clear();
      earlyExits.clear();
    },
  };
}

function callKey(event: { sessionID: string; id: string }): string {
  return JSON.stringify([event.sessionID, event.id]);
}

// A rejected hook aborts opencode's tool call and discards the command's
// output. A missing history entry is always the better failure.
async function swallowFailures(work: () => void | Promise<void>): Promise<void> {
	try {
		await work();
	} catch {
		return;
	}
}

export default Plugin.define({
  id: "atuin",
  async setup(ctx) {
    const running = new Map<string, Entry>();
    const background = trackBackground(ctx.event, running);

    await ctx.tool.hook("execute.before", event =>
      swallowFailures(async () => {
        if (!isShellTool(event.tool)) return;
        const { command, description } = (event.input ?? {}) as { command?: unknown; description?: unknown };
        if (typeof command !== "string" || command.length === 0) return;

        const key = callKey(event);
        const cwd = shellWorkingDirectory(event.input, ctx.location.directory);
        const historyId = await startHistory(cwd, command, description);
        if (historyId) running.set(key, { historyId, cwd });
      }),
    );

    await ctx.tool.hook("execute.after", event =>
      swallowFailures(async () => {
        if (!isShellTool(event.tool)) return;
        const key = callKey(event);
        const entry = running.get(key);
        if (!entry) return;
        running.delete(key);

        await background.finish(entry, event.status === "completed" ? event.result : {});
      }),
    );
    return () => {
      running.clear();
      background.close();
    };
  },
});
