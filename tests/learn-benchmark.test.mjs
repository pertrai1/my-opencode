import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import yaml from "js-yaml";
import benchmark from "../evals/learn/benchmark.mjs";
import calibration from "../evals/learn/calibration.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));
const original = yaml.load(readFileSync(join(repository, "evals/learn/promptfooconfig.yaml"), "utf8"));

test("comparison reuses the learn benchmark without calibration in model providers", () => {
  for (const config of [benchmark, calibration]) {
    for (const field of ["prompts", "tests", "defaultTest", "evaluateOptions"]) {
      assert.deepEqual(config[field], original[field], field);
    }
  }
  assert.deepEqual(benchmark.providers.map(({ label }) => label), ["baseline", "candidate"]);
  for (const provider of benchmark.providers) {
    assert.equal(provider.transform, undefined);
    assert.deepEqual(provider.config, original.providers[0].config);
  }
  assert.ok(calibration.providers.every(provider => provider.id === "echo"));
});

function runCli(t, { filter, expectedExit, config = "calibration.mjs", env = {} }) {
  const temporary = mkdtempSync(join(tmpdir(), "learn-benchmark-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const report = join(temporary, "report.json");
  const capture = join(temporary, "requests.jsonl");
  const result = spawnSync(process.execPath, [
    "--require", join(repository, "evals/failure-reporting/offline.js"),
    join(repository, "node_modules/promptfoo/dist/src/entrypoint.js"),
    "eval", "-c", `evals/learn/${config}`, "--no-cache", "--no-write",
    "--no-share", "--no-progress-bar", "--no-table", "-o", report,
    ...filter ? ["--filter-providers", filter] : [],
  ], {
    cwd: repository, encoding: "utf8", timeout: 60_000,
    env: {
      ...process.env, PROMPTFOO_CONFIG_DIR: join(temporary, "state"),
      PROMPTFOO_DISABLE_TELEMETRY: "1", PROMPTFOO_DISABLE_UPDATE: "1",
      PROMPTFOO_CAPTURE_LOG: capture, ...env,
    },
  });
  assert.equal(result.status, expectedExit, result.stdout + result.stderr);
  return { ...JSON.parse(readFileSync(report, "utf8")).results, capture };
}

test("actual offline CLI compares 7/10 and 10/10 fixtures and reports deliberate failures", (t) => {
  const { stats, results } = runCli(t, { expectedExit: 100 });
  assert.equal(stats.errors, 0);
  assert.equal(stats.successes, 17);
  assert.equal(stats.failures, 3);
  for (const [label, successes] of [["synthetic-baseline", 7], ["synthetic-candidate", 10]]) {
    const rows = results.filter(row => row.provider.label === label);
    assert.equal(rows.length, 10);
    assert.equal(rows.filter(row => row.success).length, successes);
    assert.ok(rows.every(row => !/"expected"|"semantic_review"/.test(row.prompt.raw)));
  }
  assert.deepEqual(results.filter(row => !row.success).map(row => row.testCase.vars.id).sort(),
    ["failed-attempt", "inherited-paraphrase", "stale-contradiction"]);
});

test("actual offline CLI exits successfully when only all-pass fixtures are selected", (t) => {
  const { stats } = runCli(t, { filter: "synthetic-candidate", expectedExit: 0 });
  assert.equal(stats.errors, 0);
  assert.equal(stats.successes, 10);
  assert.equal(stats.failures, 0);
});

test("real-model comparison config renders twenty unlabeled prompts using offline capture stubs", (t) => {
  const provider = `file://${join(repository, "tests/fixtures/promptfoo-wiring-provider.js")}`;
  const { stats, capture } = runCli(t, {
    config: "benchmark.mjs", expectedExit: 100,
    env: { LEARN_BASELINE_PROVIDER: provider, LEARN_CANDIDATE_PROVIDER: provider },
  });
  assert.equal(stats.errors, 0);
  assert.equal(stats.successes, 0);
  assert.equal(stats.failures, 20);
  const calls = readFileSync(capture, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(calls.length, 20);
  assert.ok(calls.every(({ prompt }) => !/"expected"|"semantic_review"/.test(prompt)));
  const cases = yaml.load(readFileSync(join(repository, "evals/learn/examples.yaml"), "utf8"));
  for (const { vars } of cases) {
    const pair = calls.filter(call => call.vars.id === vars.id);
    assert.equal(pair.length, 2);
    assert.equal(new Set(pair.map(({ prompt }) => prompt)).size, 1);
  }
});
