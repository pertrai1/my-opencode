import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const fixtureVariables = {
  angular: "ANGULAR_SKILL_ANGULAR_ROOT",
  plainJs: "ANGULAR_SKILL_PLAIN_JS_ROOT",
};

const run = promisify(execFile);

async function fixtureRoot(fixture, variables) {
  if (!Object.hasOwn(variables, fixture)) {
    throw new Error(`Unknown eval fixture: ${fixture}`);
  }
  const variable = variables[fixture];
  const configured = process.env[variable];
  if (!configured?.trim()) {
    throw new Error(`Set ${variable} to the ${fixture} fixture directory`);
  }
  const root = resolve(configured);
  const info = await stat(root).catch(() => null);
  if (!info?.isDirectory()) {
    throw new Error(`${variable} must point to an existing directory: ${root}`);
  }
  return root;
}

async function api(method, path, body, { signal, timeout = 240_000 } = {}) {
  signal?.throwIfAborted();
  const args = ["api", method, path];
  if (body) args.push("--data", JSON.stringify(body));

  const command = run("opencode", args, {
    signal,
    timeout,
    killSignal: "SIGKILL",
    maxBuffer: 16 * 1024 * 1024,
  });
  const { stdout } = await command.catch((error) => {
    // execFile's AbortSignal path uses SIGTERM even with killSignal set.
    // Stop this CLI child if it ignores that signal; never kill the server.
    if (signal?.aborted) command.child.kill("SIGKILL");
    throw error;
  });

  return stdout.trim() ? JSON.parse(stdout) : null;
}

async function interruptSession(sessionId, timeout) {
  if (!sessionId) return { status: "not-attempted", reason: "No session ID available" };
  try {
    // Cleanup must not inherit the cancelled request's signal.
    const result = await api("post", `/api/session/${encodeURIComponent(sessionId)}/interrupt`,
      undefined, { timeout });
    if (typeof result?.interrupted !== "boolean") {
      throw new Error("Interrupt response missing interrupted boolean");
    }
    return { status: result.interrupted ? "interrupted" : "idle" };
  } catch (error) {
    return { status: "unconfirmed", error: error.message };
  }
}

export default class LiveProvider {
  constructor(options = {}) {
    this.options = {
      fixtureVariables,
      id: "angular-skill-live",
      title: "Angular skill eval",
      traceInputTools: ["skill"],
      timeoutMs: 240_000,
      interruptTimeoutMs: 5_000,
      ...options,
    };
  }

  id() {
    return this.options.id;
  }

  async callApi(prompt, context, { abortSignal } = {}) {
    let sessionId;
    const request = { signal: abortSignal, timeout: this.options.timeoutMs };

    try {
      abortSignal?.throwIfAborted();
      const root = await fixtureRoot(context.vars.fixture, this.options.fixtureVariables);

      const created = await api("post", "/api/session", {
        title: this.options.title,
        location: { directory: root },
        agent: "lean",
        model: {
          providerID: "openai",
          id: "gpt-6-astra",
          variant: "high",
        },
      }, request);

      sessionId = created?.data?.id;
      if (!sessionId) throw new Error("Session creation returned no ID");

      await api("post", `/api/session/${sessionId}/prompt`, {
        text: prompt,
      }, request);
      await api("post", `/api/experimental/session/${sessionId}/wait`, undefined, request);

      const response = await api(
        "get",
        `/api/session/${sessionId}/message?order=asc&limit=100`,
        undefined, request,
      );
      // The CLI can exit before its output closes and stop listening for abort.
      abortSignal?.throwIfAborted();
      const messages = response?.data;
      if (!Array.isArray(messages) || messages.length >= 100) {
        throw new Error("Message trace missing or possibly truncated");
      }

      const start = messages.findIndex(
        (message) => message.type === "user" && message.text === prompt,
      );
      if (start < 0) throw new Error("Test prompt missing from trace");

      const following = messages.slice(start + 1);
      const end = following.findIndex((message) => message.type === "idle");
      if (end < 0 || following[end].outcome !== "succeeded") {
        throw new Error("Agent turn did not finish successfully");
      }

      const toolCalls = following
        .slice(0, end)
        .filter((message) => message.type === "assistant")
        .flatMap((message) => message.content)
        .filter((part) => part.type === "tool")
        .map((tool) => ({
          name: tool.name,
          arguments: this.options.traceInputTools.includes(tool.name) ? tool.state.input : undefined,
          status: tool.state.status,
        }));

      return {
        output: JSON.stringify({ toolCalls }),
        metadata: { sessionId },
      };
    } catch (error) {
      const cleanup = await interruptSession(sessionId, this.options.interruptTimeoutMs);
      return {
        error: error instanceof Error ? error.message : String(error),
        metadata: { sessionId, cleanup },
      };
    }
  }
}
