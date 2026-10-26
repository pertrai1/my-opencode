import { execFile } from "node:child_process";
import { promisify } from "node:util";

const roots = {
  angular: "/Users/robsimpson/Repos/angular-net-learning-app",
  plainJs: "/Users/robsimpson/Projects/sample-eval-repos/eval-plain-js-fixture",
};

const run = promisify(execFile);

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
  id() {
    return "angular-skill-live";
  }

  async callApi(prompt, context) {
    let sessionId;

    try {
      const root = roots[context.vars.fixture];
      if (!root) throw new Error("Unknown eval fixture");

      const created = await api("post", "/api/session", {
        title: "Angular skill eval",
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
          arguments: tool.name === "skill" ? tool.state.input : undefined,
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
