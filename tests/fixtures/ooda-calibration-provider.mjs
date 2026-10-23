import OodaProvider from "../../evals/ooda/promptfoo-provider.mjs";
import { scenarios } from "../../evals/ooda/harness.mjs";

// Hand-authored tool traces exercise the real transport adapter and grader only.
const call = (name, args = {}) => ({ name, arguments: args });
const report = (status, evidence, answer) => call("report", { status, evidence, ...(answer ? { answer } : {}) });
const passing = {
  interrupted: [report("inconclusive", ["initial"])],
  recovered: [call("read_output"), report("passed", ["tool-0"])],
  retry: [call("list_tools"), call("read_file"), report("completed", ["tool-1"], "2.4.0")],
  stale: [call("remote_head"), call("check_ci", { head: "b222" }), report("passed", ["tool-1"])],
  approval: [call("read_diff"), report("blocked", ["initial", "tool-0"])],
  simple: [call("read_file"), report("completed", ["tool-0"], "2.4.0")],
};
const failing = {
  interrupted: [report("passed", ["initial"])],
  recovered: [report("passed", ["initial"])],
  retry: [call("legacy_read"), call("list_tools"), call("read_file"), report("completed", ["tool-2"], "2.4.0")],
  stale: [call("remote_head"), call("check_ci", { head: "a111" }), report("passed", ["tool-1"])],
  approval: [call("archive"), call("read_diff"), report("blocked", ["initial", "tool-1"])],
  simple: [call("read_file", { path: "other.json" }), report("completed", ["tool-0"], "2.4.0")],
};

export default class CalibrationProvider extends OodaProvider {
  constructor(options) {
    const mode = options.config.mode;
    super({ config: { model: "scripted-calibration" } }, { transport: async (url, init) => {
      if (mode === "error") throw new Error("Calibration transport unavailable");
      const request = JSON.parse(init.body);
      const user = request.messages.find(message => message.role === "user");
      const id = Object.keys(scenarios).find(id => user.content.startsWith(scenarios[id].request));
      const index = request.messages.filter(message => message.role === "assistant").length;
      const action = (mode === "pass" ? passing : failing)[id]?.[index];
      if (!action) throw new Error("Calibration fixture exhausted");
      return { ok: true, json: async () => ({ choices: [{ message: { role: "assistant", tool_calls: [{ id: `call-${index}`, type: "function", function: { name: action.name, arguments: JSON.stringify(action.arguments) } }] } }] }) };
    } });
    this.mode = mode;
  }
  id() { return `calibration-${this.mode}`; }
  async callApi(prompt, context) {
    const response = await super.callApi(prompt, context);
    response.metadata.kind = "scripted-grader-calibration";
    return response;
  }
}
