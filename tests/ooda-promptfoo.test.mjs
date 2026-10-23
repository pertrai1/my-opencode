import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import OodaProvider from "../evals/ooda/promptfoo-provider.mjs";
import grade from "../evals/ooda/assertion.mjs";

test("Promptfoo provider returns episode output and assertion regrades the trace", async () => {
  const provider = new OodaProvider({ config: { model: "fixture" } }, { transport: async () => ({ ok: true, json: async () => ({ choices: [{ message: { role: "assistant", tool_calls: [{ id: "r1", function: { name: "report", arguments: JSON.stringify({ status: "inconclusive", evidence: ["initial"] }) } }] } }] }) }) });
  const response = await provider.callApi("Agent instructions", { vars: { scenario: "interrupted" } });
  assert.equal(response.error, undefined);
  assert.equal(response.output.id, "interrupted");
  assert.equal(response.metadata.kind, "local-model-simulated-tools");
  assert.match(response.metadata.promptSha256, /^[a-f0-9]{64}$/);
  assert.equal((await grade(response.output, { vars: { scenario: "interrupted" } })).pass, true);
  response.output.trace.at(-1).action.arguments.status = "passed";
  response.output.pass = true;
  assert.equal((await grade(response.output, { vars: { scenario: "interrupted" } })).pass, false);
});

test("Promptfoo provider exposes runtime errors separately from assertion failures", async () => {
  const provider = new OodaProvider({ config: { model: "fixture" } }, { transport: async () => { throw new Error("fixture transport unavailable"); } });
  const response = await provider.callApi("Agent", { vars: { scenario: "simple" } });
  assert.match(response.error, /fixture transport unavailable/);
  assert.equal(response.output, undefined);
  assert.equal(response.metadata.trace.length, 1);
});

test("assertion fails closed for malformed, mismatched and fabricated traces", async () => {
  for (const output of [null, "not JSON", {}, { id: "simple", trace: [] }, { id: "interrupted", trace: [{ id: "initial", observation: "all passed" }] }]) {
    assert.equal((await grade(output, { vars: { scenario: "interrupted" } })).pass, false);
  }
});

function runCli(t, config) {
  const repository = fileURLToPath(new URL("../", import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), "ooda-promptfoo-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = join(directory, "nested", "report.json");
  const cli = spawnSync(process.execPath, ["--require", "./evals/failure-reporting/offline.js", "./node_modules/promptfoo/dist/src/entrypoint.js", "eval", "-c", config, "--no-cache", "--no-share", "--no-progress-bar", "--no-table", "-o", output], {
    cwd: repository, encoding: "utf8", timeout: 60_000,
    env: { ...process.env, OODA_MODEL: "", PROMPTFOO_CONFIG_DIR: join(directory, "state"), PROMPTFOO_DISABLE_TELEMETRY: "1", PROMPTFOO_DISABLE_UPDATE: "1" },
  });
  assert.equal(cli.status, 100, cli.stdout + cli.stderr);
  assert.ok(existsSync(join(directory, "state", "promptfoo.db")), "Framework persists runs for viewer comparison");
  const report = JSON.parse(readFileSync(output, "utf8"));
  assert.match(report.evalId, /^eval-/);
  return report;
}

test("actual Promptfoo CLI wires all scenarios, local provider turns, assertions and error results offline", (t) => {
  const report = runCli(t, "evals/ooda/calibration.mjs");
  assert.equal(report.results.stats.successes, 6);
  assert.equal(report.results.stats.failures, 6);
  assert.equal(report.results.stats.errors, 6);
  assert.equal(report.results.results.length, 18);
  assert.deepEqual([...new Set(report.results.results.map(row => row.testCase.vars.scenario))].sort(), ["approval", "interrupted", "recovered", "retry", "simple", "stale"]);
  for (const row of report.results.results) {
    assert.equal(row.response.metadata.kind, "scripted-grader-calibration");
    assert.match(row.response.metadata.sourceHashes["provider.mjs"], /^[a-f0-9]{64}$/);
    assert.match(row.prompt.raw, /^You are the SDLC-ORCHESTRATOR/);
    if (row.provider.id === "calibration-error") {
      assert.match(row.response.error, /Calibration transport unavailable/);
      assert.equal(row.response.output, undefined);
    } else {
      assert.equal(row.success, row.provider.id === "calibration-pass");
      assert.equal(row.gradingResult.componentResults.length, 1);
      assert.equal(row.response.output.id, row.testCase.vars.scenario);
      assert.ok(row.response.output.responses.length > 0);
    }
  }
});


test("primary Promptfoo config reports missing local model as setup errors, not behavioral failures", (t) => {
  const report = runCli(t, "evals/ooda/promptfooconfig.mjs");
  assert.equal(report.results.stats.successes, 0);
  assert.equal(report.results.stats.failures, 0);
  assert.equal(report.results.stats.errors, 6);
  for (const row of report.results.results) {
    assert.match(row.response.error, /Set OODA_MODEL/);
    assert.equal(row.response.output, undefined);
  }
});
