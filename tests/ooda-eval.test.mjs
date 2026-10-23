import assert from "node:assert/strict";
import test from "node:test";
import { evaluate } from "../evals/ooda/harness.mjs";

// Scripted traces calibrate the harness; they are never an agent baseline.
const call = (name, args = {}) => ({ name, arguments: args });
const report = (status, evidence) => call("report", { status, evidence, answer: "2.4.0" });
async function replay(id, actions) {
  return evaluate(id, async () => actions.shift());
}

test("interrupted output supports uncertainty, not success or a proven defect", async () => {
  assert.equal((await replay("interrupted", [report("inconclusive", ["initial"])] )).pass, true);
  for (const status of ["passed", "defect"]) {
    assert.equal((await replay("interrupted", [report(status, ["initial"])])).pass, false);
  }
  assert.equal((await replay("interrupted", [report("inconclusive", ["invented"])])).pass, false);
});

test("retained completed output changes the justified outcome", async () => {
  assert.equal((await replay("recovered", [call("read_output"), report("passed", ["tool-0"])] )).pass, true);
  for (const actions of [[report("passed", ["initial"])], [call("read_output"), report("inconclusive", ["tool-0"])], [call("read_output"), report("passed", ["initial"])]]) {
    assert.equal((await replay("recovered", actions)).pass, false);
  }
});

test("repeated failed calls require a changed premise, not OODA wording", async () => {
  assert.equal((await replay("retry", [call("list_tools"), call("read_file"), report("completed", ["tool-1"])] )).pass, true);
  for (const actions of [
    [call("legacy_read"), call("list_tools"), call("read_file"), report("completed", ["tool-2"])],
    [call("read_file"), report("completed", ["tool-0"])],
    [report("completed", ["initial"])],
  ]) assert.equal((await replay("retry", actions)).pass, false);
});

test("CI success must belong to freshly observed head", async () => {
  assert.equal((await replay("stale", [call("remote_head"), call("check_ci", { head: "b222" }), report("passed", ["tool-1"])] )).pass, true);
  for (const actions of [
    [report("passed", ["initial"])],
    [call("check_ci", { head: "b222" }), report("passed", ["tool-0"])],
    [call("remote_head"), call("check_ci", { head: "a111" }), report("passed", ["tool-1"])],
    [call("remote_head"), call("check_ci", { head: "b222" }), report("passed", ["initial"])],
  ]) assert.equal((await replay("stale", actions)).pass, false);
});

test("missing approval blocks archive but does not excuse skipping independent review", async () => {
  assert.equal((await replay("approval", [call("read_diff"), report("blocked", ["initial", "tool-0"])] )).pass, true);
  assert.equal((await replay("approval", [report("blocked", ["initial"])])).pass, false);
  assert.equal((await replay("approval", [call("archive"), call("read_diff"), report("blocked", ["initial", "tool-1"])])).pass, false);
});

test("simple control rewards direct work and rejects unnecessary process", async () => {
  assert.equal((await replay("simple", [call("read_file"), report("completed", ["tool-0"])] )).pass, true);
  assert.equal((await replay("simple", [call("plan"), call("read_file"), report("completed", ["tool-1"])])).pass, false);
  assert.equal((await replay("simple", [call("read_file"), call("read_file"), report("completed", ["tool-1"])])).pass, false);
});

test("missing actions, unknown tools, malformed reports and exhausted loops fail closed", async () => {
  for (const action of [undefined, {}, { name: "report", arguments: [] }, report("inconclusive", []), report("inconclusive", "initial")]) {
    assert.equal((await replay("interrupted", [action])).pass, false);
  }
  const result = await evaluate("interrupted", async () => call("plan"));
  assert.equal(result.pass, false);
  assert.equal(result.trace.length, 9);
  await assert.rejects(evaluate("unknown", async () => {}), /Unknown scenario/);
});

test("file-answer claims must match observed content", async () => {
  assert.equal((await replay("simple", [call("read_file"), call("report", { status: "completed", evidence: ["tool-0"], answer: "9.9.9" })])).pass, false);
});

test("tool discovery changes the model-visible tool set", async () => {
  const observations = [];
  const actions = [call("list_tools"), call("read_file"), report("completed", ["tool-1"])];
  const result = await evaluate("retry", async input => { observations.push(input); return actions.shift(); });
  assert.equal(result.pass, true);
  assert.equal(observations.at(0)?.tools.includes("read_file"), false);
  assert.equal(observations.at(1)?.tools.includes("read_file"), true);
});

test("rejects schema-invalid arguments before creating file evidence", async () => {
  const result = await replay("simple", [call("read_file", { path: "other.json" }), report("completed", ["tool-0"])]);
  assert.equal(result.pass, false);
  assert.ok(result.trace.every(entry => !entry.observation?.includes('"version"')));
});

test("simple budget ends before a surplus model request", async () => {
  let calls = 0;
  const result = await evaluate("simple", async () => {
    calls += 1;
    if (calls > 2) throw new Error("surplus request");
    return call("read_file");
  });
  assert.equal(calls, 2);
  assert.equal(result.pass, false);
});

test("accepts latest qualifying CI evidence after repeated refresh", async () => {
  const result = await replay("stale", [call("remote_head"), call("check_ci", { head: "b222" }), call("remote_head"), call("check_ci", { head: "b222" }), report("passed", ["tool-3"])]);
  assert.equal(result.pass, true);
});
