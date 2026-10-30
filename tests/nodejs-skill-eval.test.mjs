import assert from "node:assert/strict";
import test from "node:test";
import ReplayProvider from "../evals/nodejs-skill/replay-provider.mjs";
import prompt from "../evals/nodejs-skill/prompt.mjs";
import { grade } from "../evals/nodejs-skill/grade.mjs";
import { readFileSync } from "node:fs";

const cases = JSON.parse(readFileSync(new URL("../evals/nodejs-skill/cases.json", import.meta.url), "utf8"));

test("synthetic provider rejects missing scenarios instead of returning an empty plan", async () => {
  const result = await new ReplayProvider().callApi("", { vars: { scenario: { id: "unknown" } } });
  assert.match(result.error, /Unknown/);
});

test("model prompt includes current skill and task without leaking scenario expectations", () => {
  const result = prompt({ vars: { scenario: cases.find(item => item.id === "api-rejection") } });
  assert.ok(result.includes(cases.find(item => item.id === "api-rejection").task));
  assert.ok(result.includes("name: nodejs"));
  assert.ok(!result.includes('"activate":true'));
});

test("grader rejects malformed and structurally invalid candidate output", () => {
  for (const output of ["not json", "null", "{}", '"text"', '{"activate":true,"references":[],"actions":[]}']) {
    assert.equal(grade(output, cases.find(item => item.id === "api-rejection")), false);
  }
});

test("grader rejects extra actions that contradict an otherwise valid library plan", async () => {
  const scenario = cases.find(item => item.id === "library-rejection");
  const result = await new ReplayProvider().callApi("", { vars: { scenario } });
  const plan = JSON.parse(result.output);
  assert.equal(grade(result.output, scenario), true);
  for (const action of ["stop-intake", "terminate-host-process", 42]) {
    assert.equal(grade(JSON.stringify({ ...plan, actions: [...plan.actions, action] }), scenario), false);
  }
});
