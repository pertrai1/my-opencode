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

function parseAction(call) {
  if (call.type !== "function") throw new Error("Expected a model function call");
  if (!["name", "arguments"].every(key => typeof call.function?.[key] === "string")) {
    throw new Error("Malformed model function call");
  }
  return { name: call.function.name, arguments: JSON.parse(call.function.arguments) };
}

function callId(call) {
  const id = call?.id;
  if (typeof id !== "string" || !id.trim()) throw new Error("Expected nonempty tool call IDs");
  return id;
}

function parseActions(calls) {
  if (!Array.isArray(calls) || !calls.length) throw new Error("Expected at least one model tool call");
  const ids = calls.map(callId);
  if (new Set(ids).size !== ids.length) throw new Error("Expected unique tool call IDs within a response");
  return calls.map(parseAction);
}

function appendObservations(messages, calls, trace) {
  const entries = trace.slice(-calls.length);
  calls.forEach((call, index) => {
    const entry = entries[index];
    messages.push({ role: "tool", tool_call_id: call.id, content: `${entry.id}: ${entry.observation}` });
  });
}

export default class ReviewDelegationProvider {
  constructor(options = {}, dependencies = {}) {
    this.config = options.config ?? {};
    this.transport = dependencies.transport ?? fetch;
  }

  id() { return "review-delegation-local-model"; }

  async requestActions(endpoint, model, messages) {
    const response = await this.transport(endpoint, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(120_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0, messages, tools, tool_choice: "required", parallel_tool_calls: false }),
    });
    if (!response.ok) throw new Error(`Local model HTTP ${response.status}`);
    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const actions = parseActions(message?.tool_calls);
    return { message, actions };
  }

  async callApi(prompt, context) {
    const messages = [
      { role: "system", content: `${prompt}\n\nThis is a simulated repository. Only supplied tools are available; none has external effects. Prefer one tool call per turn. Multiple calls execute in listed order; their observations arrive together on the next turn. Finish through finish, citing tool observation IDs you have received. A subagent call runs to completion before returning. For a human-only viewer request, after receiving confirmation that the viewer opened, call finish with status viewer-opened, a brief summary, and evidence containing the opening tool's observation ID. Do not end with a plain-text reply.` },
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
        else appendObservations(messages, previous, input.trace);
        const result = await this.requestActions(endpoint, model, messages);
        messages.push(result.message);
        previous = result.message.tool_calls;
        return result.actions;
      });
      delete metadata.trace;
      return { output: result, metadata };
    } catch (error) {
      return { error: error.message, metadata };
    }
  }
}
