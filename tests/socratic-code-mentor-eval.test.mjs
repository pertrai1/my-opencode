import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import yaml from "js-yaml";
import grade, { checks } from "../evals/socratic-code-mentor/checks.mjs";
import prompt from "../evals/socratic-code-mentor/prompt.js";

const read = (name) => readFileSync(new URL(`../evals/socratic-code-mentor/${name}`, import.meta.url), "utf8");
const cases = yaml.load(read("cases.yaml"));
const good = Object.fromEntries(yaml.load(read("calibration.yaml")).tests.map(({ vars }) => [vars.check, vars.candidate]));
const code = "```go\nx := 1\n```";

// Deliberately wrong candidates; each must fail its own check.
const bad = {
  "ask-mode": ["Great! Here is the plan.\nLevel 1: parse RESP.", "Challenge mode or mentor mode? ```go\nfunc main(){}\n```", "Let's begin."],
  "hint-1": [`Use this:\n${code}`, "The lock is taken after the read."],
  "stuck-hint-5": ["Which index do you think should move?", `${code}\nNow explain it back in your own words.`],
  "do-it-for-me": ["Which part is unclear?", `${"Let me explain how lengths work first. ".repeat(12)}\n${code}`],
  "finish-line": ["Great job, the project is done.", "Bonus round? The tests already exist.", "These parts were written for you: tests. Bonus round?"],
  "bonus-declined": ["Bonus round? I empty one function.", "Fine. Also, want a bonus challenge later?"],
};

test("every case names a known check and uses no expected-output fields", () => {
  for (const { vars } of cases) {
    assert.ok(checks[vars.check], `unknown check ${vars.check}`);
    assert.ok(vars.situation && vars.user_message);
  }
  assert.deepEqual(Object.keys(checks).sort(), cases.map(({ vars }) => vars.check).sort());
});

test("known-good candidates pass and wrong candidates fail", () => {
  for (const name of Object.keys(checks)) {
    const context = { vars: { check: name } };
    assert.equal(grade(good[name], context).pass, true, `good ${name}`);
    for (const candidate of bad[name]) assert.equal(grade(candidate, context).pass, false, `bad ${name}: ${candidate.slice(0, 30)}`);
  }
});

test("unknown check fails closed", () => {
  assert.equal(grade("x", { vars: { check: "nope" } }).pass, false);
});

test("prompt embeds the skill body and sends only scenario data", () => {
  const first = cases.find(({ vars }) => vars.check === "ask-mode");
  assert.ok(first, "Expected an ask-mode case");
  const [system, user] = prompt({ vars: { ...first.vars, check: "SHOULD_NOT_LEAK" } });
  assert.match(system.content, /# Socratic Code Mentor/);
  assert.doesNotMatch(system.content, /^---/);
  assert.match(user.content, /Redis/);
  assert.doesNotMatch(user.content, /SHOULD_NOT_LEAK|ask-mode/);
});
