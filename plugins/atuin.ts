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
import { spawn } from "node:child_process";
import { isShellTool } from "../lib/shell-command.ts";
import { shellWorkingDirectory } from "../lib/shell-workdir.ts";

const ATUIN_AUTHOR = "opencode";
const ATUIN_TIMEOUT_MS = 10_000;

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
			child = spawn("atuin", args, { cwd, stdio: ["ignore", "pipe", "ignore"] });
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
		child.on("error", () => settle({ code: null, stdout: "" }));
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

// The tool records an abort or a timeout in its output text rather than as an
// exit code, so string matching is the only way to tell the two apart.
function exitCodeFrom(result: { content?: unknown; metadata?: unknown }): number {
  const exit = (result.metadata as { exit?: unknown } | undefined)?.exit;
  if (typeof exit === "number") return exit;

  const text = typeof result.content === "string" ? result.content : Array.isArray(result.content)
    ? result.content.filter(block => block?.type === "text").map(block => block.text).join("\n")
    : "";
	if (text.includes("User aborted the command")) return EXIT_ABORTED;
	if (/exceeding timeout \d+ ms/.test(text)) return EXIT_TIMED_OUT;
	return 1;
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

    await ctx.tool.hook("execute.before", event =>
      swallowFailures(async () => {
        if (!isShellTool(event.tool)) return;
        const { command, description } = (event.input ?? {}) as { command?: unknown; description?: unknown };
        if (typeof command !== "string" || command.length === 0) return;

        const key = JSON.stringify([event.sessionID, event.id]);
        const cwd = shellWorkingDirectory(event.input, ctx.location.directory);
        const historyId = await startHistory(cwd, command, description);
        if (historyId) running.set(key, { historyId, cwd });
      }),
    );

    await ctx.tool.hook("execute.after", event =>
      swallowFailures(async () => {
        if (!isShellTool(event.tool)) return;
        const key = JSON.stringify([event.sessionID, event.id]);
        const entry = running.get(key);
        if (!entry) return;
        running.delete(key);

        const exit = exitCodeFrom(event.status === "completed" ? event.result : {});
        await atuin(["history", "end", entry.historyId, "--exit", String(exit)], entry.cwd);
      }),
    );
  },
});
