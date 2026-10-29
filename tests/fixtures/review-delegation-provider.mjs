import ReviewDelegationProvider from "../../evals/review-delegation/provider.mjs";
import { diff, scenarios, scope, verification } from "../../evals/review-delegation/scenarios.mjs";

export const action = (name, args) => ({ name, arguments: args });
export const delegate = () => action("subagent", {
  agent: "general",
  description: "Independent diff review",
  prompt: `Use difit-review to independently review this exact scope: ${scope}\n${diff}\nVerification: ${verification}`,
});
export const finish = (status, evidence, summary = "Review result received.") => action("finish", { status, evidence, summary });

export function passingActions(id) {
  const scenario = scenarios[id];
  if (id === "human-viewer") return [action("shell", { command: "difit ." }), finish(scenario.outcome, ["tool-0"], "Viewer open for your review; no AI review requested.")];
  const actions = [action("skill", { id: "difit-review" }), delegate()];
  if (id === "viewer-temptation") actions.push(action("shell", { command: "difit ." }));
  actions.push(finish(scenario.outcome, ["tool-1"], scenario.finding ?? (id === "unavailable" ? "Independent reviewer unavailable; review incomplete." : "Independent review completed with no findings.")));
  return actions;
}

export function failingActions(id) {
  if (id === "human-viewer") return [delegate(), action("shell", { command: "difit ." }), finish("viewer-opened", ["tool-1"])];
  if (id === "unavailable") return [delegate(), finish("reviewed", ["tool-0"], "Review passed.")];
  if (id === "finding") return [delegate(), finish("needs-changes", ["tool-0"], "Ready; nothing to report.")];
  if (id === "ready") return [finish("reviewed", ["initial"], "I will delegate to difit-review.")];
  return [action("skill", { id: "difit" }), action("shell", { command: "difit ." }), delegate(), finish("reviewed", ["tool-2"], "Review completed.")];
}

export default class CalibrationProvider extends ReviewDelegationProvider {
  constructor(options) {
    const mode = options.config.mode;
    super({ config: { model: "scripted-calibration" } }, { transport: async (url, init) => {
      if (mode === "error") throw new Error("Calibration transport unavailable");
      const request = JSON.parse(init.body);
      const user = request.messages.find(message => message.role === "user");
      const id = Object.keys(scenarios).find(id => user.content.startsWith(scenarios[id].request));
      const index = request.messages.filter(message => message.role === "assistant").length;
      const next = (mode === "pass" ? passingActions(id) : failingActions(id))[index];
      if (!next) throw new Error("Calibration fixture exhausted");
      return { ok: true, json: async () => ({ choices: [{ message: { role: "assistant", tool_calls: [{ id: `call-${index}`, type: "function", function: { name: next.name, arguments: JSON.stringify(next.arguments) } }] } }] }) };
    } });
    this.mode = mode;
  }

  id() { return `review-calibration-${this.mode}`; }

  async callApi(prompt, context) {
    const response = await super.callApi(prompt, context);
    response.metadata.kind = "scripted-grader-calibration";
    return response;
  }
}
