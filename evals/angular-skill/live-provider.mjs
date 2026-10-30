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

async function api(method, path, body) {
  const args = ["api", method, path];
  if (body) args.push("--data", JSON.stringify(body));

  const { stdout } = await run("opencode", args, {
    timeout: 240_000,
    maxBuffer: 16 * 1024 * 1024,
  });

  return stdout.trim() ? JSON.parse(stdout) : null;
}

export default class LiveProvider {
  constructor(options = {}) {
    this.options = {
      fixtureVariables,
      id: "angular-skill-live",
      title: "Angular skill eval",
      traceInputs: false,
      ...options,
    };
  }

  id() {
    return this.options.id;
  }

  async callApi(prompt, context) {
    let sessionId;

    try {
      const root = await fixtureRoot(context.vars.fixture, this.options.fixtureVariables);

      const created = await api("post", "/api/session", {
        title: this.options.title,
        root,
        agent: "lean",
        model: {
          providerID: "openai",
          id: "gpt-6-astra",
          variant: "high",
        },
      });

      sessionId = created?.data?.id;
      if (!sessionId) throw new Error("Session creation returned no ID");

      await api("post", `/api/session/${sessionId}/prompt`, {
        text: prompt,
      });
      await api("post", `/api/experimental/session/${sessionId}/wait`);

      const response = await api(
        "get",
        `/api/session/${sessionId}/message?order=asc&limit=100`,
      );
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
          arguments: this.options.traceInputs || tool.name === "skill" ? tool.state.input : undefined,
          status: tool.state.status,
        }));

      return {
        output: JSON.stringify({ toolCalls }),
        metadata: { sessionId },
      };
    } catch (error) {
      return {
        error: error.message,
        metadata: { sessionId },
      };
    }
  }
}
