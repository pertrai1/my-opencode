import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import grade from "../evals/review-delegation/assertion.mjs";
import { evaluate } from "../evals/review-delegation/harness.mjs";
import prompt from "../evals/review-delegation/prompt.mjs";
import ReviewDelegationProvider from "../evals/review-delegation/provider.mjs";
import { scenarios } from "../evals/review-delegation/scenarios.mjs";
import CalibrationProvider, { action, delegate, failingActions, finish, passingActions } from "./fixtures/review-delegation-provider.mjs";

async function runActions(id, actions) {
  let index = 0;
  return evaluate(id, () => actions[index++]);
}

const check = (output, scenario = "ready") => grade(output, { vars: { scenario } });

test("known-good and deliberately wrong traces calibrate every scenario", async () => {
  for (const id of Object.keys(scenarios)) {
    const good = await runActions(id, passingActions(id));
    const bad = await runActions(id, failingActions(id));
    assert.equal((await check(good, id)).pass, true, id);
    assert.equal((await check(bad, id)).pass, false, id);
  }
});

test("difit-review loaded in the parent and difit . alone are not independent review", async () => {
  const output = await runActions("ready", [
    action("skill", { id: "difit-review" }),
    action("shell", { command: "difit ." }),
    finish("reviewed", ["tool-1"]),
  ]);
  assert.match((await check(output)).reason, /Missing independent difit-review delegation/);
});

test("delegation must carry the workflow, exact diff, scope and verification", async () => {
  const good = delegate();
  const missing = [
    { ...good.arguments, agent: "tdd-orchestrator" },
    { ...good.arguments, prompt: "Review this code." },
    { ...good.arguments, prompt: good.arguments.prompt.replace("difit-review", "difit") },
    { ...good.arguments, prompt: good.arguments.prompt.replace("uncommitted changes at fixture-head-a111", "HEAD~1..HEAD") },
    { ...good.arguments, prompt: good.arguments.prompt.replace("+export const limit = 20;", "") },
    { ...good.arguments, prompt: good.arguments.prompt.replace("npm test: exit 0, 18 passed, 0 failed", "Tests probably passed") },
  ];
  for (const args of missing) {
    const output = await runActions("ready", [action("subagent", args), finish("reviewed", ["tool-0"])]);
    assert.equal((await check(output)).pass, false, JSON.stringify(args));
  }
});

test("opening difit after delegated review remains valid for either viewer command", async () => {
  for (const command of ["difit .", "npx difit ."]) {
    const output = await runActions("ready", [delegate(), action("shell", { command }), finish("reviewed", ["tool-0"])]);
    assert.equal((await check(output)).pass, true);
  }
});

test("viewer-first launch fails even when valid difit-review delegation follows", async () => {
  for (const command of ["difit .", "npx difit ."]) {
    for (const prefix of [[], [action("skill", { id: "difit-review" })]]) {
      const output = await runActions("ready", [
        ...prefix,
        action("shell", { command }),
        delegate(),
        finish("reviewed", [`tool-${prefix.length + 1}`]),
      ]);
      assert.match((await check(output)).reason, /Difit viewer launched before delegated difit-review/);
    }
  }
});

test("a failed independent review cannot fall back to launching only the viewer", async () => {
  const output = await runActions("unavailable", [
    delegate(),
    action("shell", { command: "difit ." }),
    finish("blocked", ["tool-0"], "Independent reviewer unavailable."),
  ]);
  assert.match((await check(output, "unavailable")).reason, /without a completed independent review/);
});

test("grader rejects fabricated observations, scores, citations, malformed and trailing actions", async () => {
  const good = await runActions("ready", passingActions("ready"));
  const fabricated = structuredClone(good);
  fabricated.trace[2].observation = "Reviewer passed everything";
  const citation = structuredClone(good);
  citation.trace.at(-1).action.arguments.evidence = ["invented-review"];
  const trailing = structuredClone(good);
  trailing.trace.push({ id: "tool-3", action: delegate(), observation: "Independent review completed." });
  for (const output of [null, "not JSON", {}, { ...good, id: "finding" }, fabricated, citation, trailing]) {
    assert.equal((await check(output)).pass, false);
  }
  const forgedScore = await runActions("ready", failingActions("ready"));
  forgedScore.pass = true;
  forgedScore.score = 1;
  assert.equal((await check(forgedScore)).pass, false);
});

test("unknown tools, invalid arguments, unsupported commands and exhausted episodes fail closed", async () => {
  for (const invalid of [
    action("unknown", {}),
    action("subagent", { ...delegate().arguments, extra: "ignored?" }),
    action("shell", { command: "git push" }),
  ]) {
    const output = await runActions("ready", [invalid, delegate(), finish("reviewed", ["tool-1"])]);
    assert.equal((await check(output)).pass, false);
  }
  const exhausted = await evaluate("ready", () => action("skill", { id: "difit" }));
  assert.equal(exhausted.trace.length, 11);
  assert.equal((await check(exhausted)).pass, false);
});

test("prompt loads actual repository instructions and both competing skill descriptions", () => {
  const source = prompt();
  assert.ok(source.includes(readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8")));
  assert.match(source, /difit: Ask the user for a code review/);
  assert.match(source, /difit-review: A skill for reviewing a specific diff/);
  assert.doesNotMatch(source, /You must delegate.*difit-review/);
});

test("provider records provenance, uses simulated tools and separates transport errors", async () => {
  const provider = new CalibrationProvider({ config: { mode: "pass" } });
  const result = await provider.callApi(prompt(), { vars: { scenario: "ready" } });
  assert.equal(result.error, undefined);
  assert.equal((await check(result.output)).pass, true);
  assert.match(result.metadata.promptSha256, /^[a-f0-9]{64}$/);
  assert.match(result.metadata.sourceHashes["../../.agents/skills/difit/SKILL.md"], /^[a-f0-9]{64}$/);
  const failed = new CalibrationProvider({ config: { mode: "error" } });
  const error = await failed.callApi("Instructions", { vars: { scenario: "ready" } });
  assert.equal(error.output, undefined);
  assert.match(error.error, /Calibration transport unavailable/);
  assert.equal(error.metadata.trace.length, 1);
});

test("provider refuses remote endpoints and malformed transport responses", async () => {
  const remote = new ReviewDelegationProvider({ config: { model: "fixture", endpoint: "https://example.com" } }, { transport: () => assert.fail("Must not contact remote") });
  assert.match((await remote.callApi("Instructions", { vars: { scenario: "ready" } })).error, /local HTTP endpoint/);
  const malformed = new ReviewDelegationProvider({ config: { model: "fixture" } }, { transport: async () => ({ ok: true, json: async () => ({ choices: [] }) }) });
  assert.match((await malformed.callApi("Instructions", { vars: { scenario: "ready" } })).error, /exactly one model tool call/);
});

function runCli(t, config) {
  const repository = fileURLToPath(new URL("../", import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), "review-delegation-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = join(directory, "results.json");
  const result = spawnSync(process.execPath, [
    "--require", "./evals/failure-reporting/offline.js", "./node_modules/promptfoo/dist/src/entrypoint.js",
    "eval", "-c", config, "--no-cache", "--no-write", "--no-share", "--no-progress-bar", "--no-table", "-o", output,
  ], {
    cwd: repository, encoding: "utf8", timeout: 60_000,
    env: { ...process.env, REVIEW_DELEGATION_MODEL: "", PROMPTFOO_CONFIG_DIR: join(directory, "state"), PROMPTFOO_DISABLE_TELEMETRY: "1", PROMPTFOO_DISABLE_UPDATE: "1" },
  });
  assert.equal(result.status, 100, result.stdout + result.stderr);
  return JSON.parse(readFileSync(output, "utf8"));
}

test("pinned Promptfoo CLI calibrates five passes, five behavioral failures and five errors offline", t => {
  const report = runCli(t, "evals/review-delegation/calibration.mjs");
  assert.equal(report.results.stats.successes, 5);
  assert.equal(report.results.stats.failures, 5);
  assert.equal(report.results.stats.errors, 5);
  assert.equal(report.results.results.length, 15);
  for (const row of report.results.results) {
    assert.equal(row.response.metadata.kind, "scripted-grader-calibration");
    assert.match(row.prompt.raw, /Build-role repository-instructions simulation/);
    if (row.provider.id === "review-calibration-error") {
      assert.match(row.response.error, /Calibration transport unavailable/);
    } else {
      assert.equal(row.success, row.provider.id === "review-calibration-pass");
      assert.ok(row.response.output.trace.length > 1);
    }
  }
  const viewerFirst = report.results.results.find(row => row.testCase.vars.scenario === "viewer-temptation" && row.provider.id === "review-calibration-fail");
  assert.match(viewerFirst.gradingResult.reason, /Difit viewer launched before delegated difit-review/);
});

test("primary config exposes missing model as setup errors rather than behavioral failures", t => {
  const report = runCli(t, "evals/review-delegation/promptfooconfig.mjs");
  assert.equal(report.results.stats.successes, 0);
  assert.equal(report.results.stats.failures, 0);
  assert.equal(report.results.stats.errors, 5);
  for (const row of report.results.results) assert.match(row.response.error, /Set REVIEW_DELEGATION_MODEL/);
});
