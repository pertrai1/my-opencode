import { readFileSync } from "node:fs";

export default class ReplayProvider {
  id() {
    return "angular-skill-replay";
  }

  async callApi(prompt, context) {
    try {
      const { data: messages } = JSON.parse(
        readFileSync(new URL("./session.json", import.meta.url), "utf8"),
      );
      const start = messages.findIndex(
        (message) => message.id === context.vars.messageId,
      );
      if (start < 0 || messages[start].type !== "user") {
        throw new Error("Test message not found");
      }
      if (messages[start].text !== prompt) {
        throw new Error("Recorded prompt does not match test prompt");
      }

      const following = messages.slice(start + 1);
      const nextUser = following.findIndex(
        (message) => message.type === "user",
      );
      const turn = nextUser < 0 ? following : following.slice(0, nextUser);

      if (
        !turn.some(
          (message) =>
            message.type === "idle" && message.outcome === "succeeded",
        )
      ) {
        throw new Error("Complete successful turn not found in snapshot");
      }

      const toolCalls = turn
        .filter((message) => message.type === "assistant")
        .flatMap((message) => message.content)
        .filter((part) => part.type === "tool")
        .map((tool) => ({
          name: tool.name,
          arguments: tool.state.input,
          status: tool.state.status,
        }));

      return { output: JSON.stringify({ toolCalls }) };
    } catch (error) {
      return { error: error.message };
    }
  }
}
