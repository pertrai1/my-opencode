import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import config from "../evals/angular-skill/guidance.mjs";
import prompt from "../evals/angular-skill/guidance-prompt.mjs";

const cases = JSON.parse(readFileSync(new URL("../evals/angular-skill/guidance-cases.json", import.meta.url), "utf8"));

// These tests check offline wiring, not model responses or rubric accuracy.
test("guidance cases cover version, runtime, resource, SSR and migration boundaries", () => {
  assert.deepEqual(cases.map(scenario => scenario.id), [
    "angular-17-1", "angular-17-2", "angular-17-3", "vitest-zoneless",
    "zone-jasmine", "resource-lifecycle", "http-resource-mutation",
    "ssr-private-data", "queries-projection", "defer-boundaries", "migration-boundaries",
  ]);
  assert.equal(new Set(cases.map(scenario => scenario.id)).size, cases.length);
  for (const scenario of cases) {
    assert.ok(scenario.task.trim());
    assert.ok(scenario.rubric.trim());
  }
});

test("model config preserves tasks and independent judgment rubrics without leaking answers", () => {
  assert.equal(config.tests.length, cases.length);
  assert.equal(config.evaluateOptions.maxConcurrency, 1);
  for (const [index, row] of config.tests.entries()) {
    assert.deepEqual(row.vars, { task: cases[index].task });
    assert.deepEqual(row.assert, [{ type: "llm-rubric", value: cases[index].rubric }]);
    const result = prompt({ vars: row.vars });
    assert.ok(result.includes(cases[index].task));
    assert.ok(!result.includes(cases[index].rubric));
  }
});

test("guidance prompt reads actual skill and every current reference", () => {
  const root = new URL("../skills/angular/", import.meta.url);
  const result = prompt({ vars: { task: "Review this Angular change." } });
  assert.ok(result.includes(readFileSync(new URL("SKILL.md", root), "utf8")));
  for (const file of readdirSync(new URL("references/", root)).filter(name => name.endsWith(".md"))) {
    assert.ok(result.includes(readFileSync(new URL(`references/${file}`, root), "utf8")), file);
  }
});
