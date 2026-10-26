import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import yaml from "js-yaml";
import check from "../evals/review-risk/mechanics.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const candidate = (header) => `${header}
Scope: PR base a -> head b.
Evidence: supplied evidence.
Impact: consumers inspected.
Focus / gaps: missing verification; advisory, not approval.`;
const assessment = ([r = 0, c = 0, u = 0], total, budget, override = "none") => candidate(
  `Review risk (proposed): R${r} + C${c} + U${u} = ${total}/6; ${budget} (heuristic); override: ${override}.`,
);

test("mechanics enforce every rating combination, sum, budget and C2 override", () => {
  for (let r = 0; r <= 2; r++) for (let c = 0; c <= 2; c++) for (let u = 0; u <= 2; u++) {
    const total = r + c + u;
    const budget = c === 2 || total >= 4 ? "deep" : total >= 2 ? "focused" : "quick";
    assert.equal(check(assessment([r, c, u], total, budget, c === 2 ? "high consequence" : "none")).pass, true);
    assert.equal(check(assessment([r, c, u], (total + 1) % 7, budget)).pass, false);
  }
  assert.equal(check(assessment([1, 0, 0], 1, "deep", "credentials")).pass, true);
  assert.equal(check(assessment([1, 0, 0], 1, "quick", "credentials")).pass, false);
  assert.equal(check(assessment([0, 2, 0], 2, "focused")).pass, false);
  assert.equal(check(assessment([0, 2, 0], 2, "deep")).pass, false);
  assert.equal(check(assessment([1, 1, 0], 2, "quick")).pass, false);
});

test("mechanics reject malformed ratings, missing fields and invalid output", () => {
  const valid = assessment([1, 1, 0], 2, "focused");
  for (const output of [null, {}, "", valid.replace("R1", "R3"), valid.replace("C1", "C-1"), valid.replace("U0", "U0.5"), valid.replace("2/6", "7/6"), valid.replace("override: none", "override: ")]) {
    assert.equal(check(output).pass, false);
  }
  for (const label of ["Scope", "Evidence", "Impact", "Focus / gaps"]) {
    assert.equal(check(valid.split("\n").filter((line) => !line.startsWith(`${label}:`)).join("\n")).pass, false);
    assert.equal(check(valid.replace(new RegExp(`${label}: [^\\n]+`), `${label}: `)).pass, false);
  }
  assert.equal(check(valid.replaceAll("\n", "\r\n")).pass, true);
});

test("mechanical success cannot establish semantic judgment", () => {
  // If the actual evidence were an authorization bypass, this would be wrong.
  // Mechanics deliberately cannot infer that failure from free-form evidence.
  const unjustified = assessment([0, 0, 0], 0, "quick").replace("supplied evidence", "one-line authorization bypass with unknown consumers");
  assert.equal(check(unjustified).pass, true);
  assert.match(check(unjustified).reason, /semantic judgment remains unverified/);
});

test("all five YAML examples retain evidence and separate semantic review notes", () => {
  const examples = yaml.load(read("evals/review-risk/examples.yaml"));
  assert.equal(examples.length, 5);
  for (const { description, vars } of examples) {
    assert.ok(vars.evidence.trim(), description);
    assert.ok(vars.semantic_review.trim(), description);
    assert.equal(check(vars.candidate).pass, true, description);
  }
  const config = yaml.load(read("evals/review-risk/promptfooconfig.yaml"));
  assert.deepEqual(config.providers, ["echo"]);
  assert.equal(config.tests, "file://examples.yaml");
});

test("global trigger and review command resolve to the one shared rubric", () => {
  const { config, error } = ts.parseConfigFileTextToJson("opencode.jsonc", read("opencode.jsonc"));
  assert.equal(error, undefined);
  assert.ok(config.instructions.includes("~/.config/opencode/docs/agents/style-guide.md"));
  for (const path of ["docs/agents/style-guide.md", "commands/code-review.md"]) {
    assert.match(read(path), /\]\(~\/\.config\/opencode\/docs\/agents\/review-risk\.md\)/);
  }
  const command = read("commands/code-review.md");
  assert.match(command, /Do not edit files, apply patches, or change the repository state/);
  assert.match(command, /skip it and apply the existing manual rules to the full scoped/);
  assert.match(command, /Do not remove a router-selected reviewer/);
  assert.match(command, /Independently assess reach, consequence, and uncertainty/);
  assert.match(command, /Do not post remote comments or publish changes/);
});
