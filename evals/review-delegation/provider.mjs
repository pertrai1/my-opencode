import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { localEndpoint } from "../ooda/provider.mjs";
import { evaluate } from "./harness.mjs";
import { tools } from "./tools.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const hash = value => createHash("sha256").update(value).digest("hex");
const sources = ["scenarios.mjs", "tools.mjs", "harness.mjs", "assertion.mjs", "prompt.mjs", "provider.mjs", "promptfooconfig.mjs", "../ooda/provider.mjs", "../../.agents/skills/difit/SKILL.md", "../../.agents/skills/difit-review/SKILL.md"];

export default class ReviewDelegationProvider {
  constructor(options = {}, dependencies = {}) {
    this.config = options.config ?? {};
    this.transport = dependencies.transport ?? fetch;
  }

  id() { return "review-delegation-local-model"; }

  async requestAction(endpoint, model, messages) {
    const response = await this.transport(endpoint, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(120_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0, messages, tools, tool_choice: "required", parallel_tool_calls: false }),
    });
    if (!response.ok) throw new Error(`Local model HTTP ${response.status}`);
    const data = await response.json();
    const message = data.choices?.[0]?.message;
    if (message?.tool_calls?.length !== 1) throw new Error("Expected exactly one model tool call");
    const call = message.tool_calls[0];
    return { message, call, action: { name: call.function.name, arguments: JSON.parse(call.function.arguments) } };
  }

  async callApi(prompt, context) {
    const messages = [
      { role: "system", content: prompt },
      { role: "system", content: "This is a simulated repository. Only supplied tools are available; none has external effects. Use one tool call per turn. Finish through finish, citing tool observation IDs. A subagent call runs to completion before returning." },
    ];
    const metadata = { kind: "local-model-simulated-tools", promptSha256: hash(prompt) };
    let previous;
    try {
      const model = this.config.model ?? process.env.REVIEW_DELEGATION_MODEL;
      if (!model) throw new Error("Set REVIEW_DELEGATION_MODEL to an already-installed local tool-calling model");
      const endpoint = localEndpoint(this.config.endpoint ?? "http://127.0.0.1:11434/v1/chat/completions");
      Object.assign(metadata, {
        model, endpoint: endpoint.href,
        commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim(),
        dirty: execFileSync("git", ["status", "--porcelain"], { cwd: repository, encoding: "utf8" }).trim() !== "",
        sourceHashes: Object.fromEntries(sources.map(path => [path, hash(readFileSync(new URL(path, import.meta.url)))])),
      });
      const result = await evaluate(context.vars.scenario, async input => {
        metadata.trace = structuredClone(input.trace);
        if (!previous) messages.push({ role: "user", content: `${input.request}\n\n${input.trace[0].observation}` });
        else {
          const entry = input.trace.at(-1);
          messages.push({ role: "tool", tool_call_id: previous.id, content: `${entry.id}: ${entry.observation}` });
        }
        const result = await this.requestAction(endpoint, model, messages);
        messages.push(result.message);
        previous = result.call;
        return result.action;
      });
      delete metadata.trace;
      return { output: result, metadata };
    } catch (error) {
      return { error: error.message, metadata };
    }
  }
}
