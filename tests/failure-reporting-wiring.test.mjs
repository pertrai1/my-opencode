import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repository = fileURLToPath(new URL("../", import.meta.url));
const caseDirectory = join(repository, "evals/failure-reporting");
const scenarios = [
  { trace: "test-run-1", file: "evidence.txt" },
  { trace: "test-run-2", file: "interrupted-evidence.txt" },
];

function captureRequests(t, name) {
  const directory = mkdtempSync(join(tmpdir(), "failure-reporting-wiring-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const provider = join(repository, "tests/fixtures/promptfoo-wiring-provider.js");
  const config = name === "calibrate"
    ? join(repository, "promptfooconfig.yaml")
    : join(directory, `${name}.yaml`);
  const log = join(directory, "requests.jsonl");
  const report = join(directory, "report.json");
  // Preserve the real config's variables, prompts, rubric, tests, and base path.
  // Replace only paid providers with a local recorder and canned rejection.
  const source = name === "calibrate"
    ? join(repository, "promptfooconfig.yaml")
    : join(caseDirectory, `${name}.yaml`);
  const yaml = readFileSync(source, "utf8")
    .replaceAll("openai:chat:gpt-4o", `file://${provider}`);
  if (name !== "calibrate") {
    writeFileSync(config, `${yaml}\nbasePath: ${JSON.stringify(caseDirectory)}\n`);
  }
  const result = spawnSync(process.execPath, [
    "--require", join(caseDirectory, "offline.js"),
    join(repository, "node_modules/promptfoo/dist/src/entrypoint.js"),
    "eval", "-c", config, "--no-cache", "--no-write", "--no-share",
    "--no-progress-bar", "--no-table", "-o", report,
  ], {
    cwd: repository,
    encoding: "utf8",
    timeout: 30_000,
    env: {
      ...process.env,
      PROMPTFOO_CONFIG_DIR: join(directory, "state"),
      PROMPTFOO_DISABLE_TELEMETRY: "1",
      PROMPTFOO_DISABLE_UPDATE: "1",
      PROMPTFOO_CAPTURE_LOG: log,
    },
  });
  assert.equal(result.status, 100, result.stdout + result.stderr);
  const results = JSON.parse(readFileSync(report, "utf8")).results;
  assert.equal(results.stats.errors, 0);
  return {
    rows: results.results,
    calls: existsSync(log)
      ? readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line))
      : [],
  };
}

test("offline calibration replays two truthful and two invented-success examples", (t) => {
  const { rows, calls } = captureRequests(t, "calibrate");
  assert.deepEqual(calls, []);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(row => ({
    description: row.testCase.description,
    pass: row.success,
  })).sort((a, b) => a.description.localeCompare(b.description)), [
    { description: "Interrupted-run invented-success example (expected FAIL)", pass: false },
    { description: "Interrupted-run truthful example (expected PASS)", pass: true },
    { description: "Invented-success hand-authored example (expected FAIL)", pass: false },
    { description: "Truthful hand-authored example (expected PASS)", pass: true },
  ]);
  for (const row of rows) {
    assert.equal(row.response.output, row.prompt.raw);
    assert.deepEqual(row.gradingResult.componentResults.map(result => result.pass),
      [true, row.success]);
  }
});

for (const [name, judgeCount] of [["judge", 4], ["model", 2]]) {
  test(`${name} config loads full evidence into the rendered prompts offline`, (t) => {
    const { calls, rows } = captureRequests(t, name);
    const judges = calls.filter(call => call.kind === "judge");
    const candidates = calls.filter(call => call.kind === "candidate");
    assert.equal(judges.length, judgeCount);
    assert.equal(rows.length, judgeCount);
    for (const scenario of scenarios) {
      const evidence = readFileSync(join(caseDirectory, scenario.file), "utf8").trim();
      const matchingJudges = judges.filter(call => call.vars.trace_id === scenario.trace);
      assert.equal(matchingJudges.length, name === "judge" ? 2 : 1);
      for (const call of matchingJudges) {
        assert.equal(call.vars.evidence.trim(), evidence);
        assert.equal(call.prompt.match(/<evidence>\n([\s\S]*?)\n<\/evidence>/)?.[1].trim(), evidence);
      }
      const matchingCandidates = candidates.filter(call => call.vars.trace_id === scenario.trace);
      assert.equal(matchingCandidates.length, name === "model" ? 1 : 0);
      for (const call of matchingCandidates) {
        const messages = JSON.parse(call.prompt);
        assert.equal(messages.find(message => message.role === "user")?.content.trim(), evidence);
        assert.match(messages.find(message => message.role === "system")?.content, /^You are the CHANGE-VERIFIER\./);
      }
    }
    for (const call of [...judges, ...candidates]) {
      assert.doesNotMatch(call.prompt, /file:\/\/|\{\{evidence\}\}/);
    }
    for (const call of judges) {
      const candidate = call.prompt.match(/<candidate>\n([\s\S]*?)\n<\/candidate>/)?.[1];
      assert.ok(rows.some(row => row.response.output === candidate));
    }
    assert.equal(candidates.length, name === "model" ? 2 : 0);
    if (name === "judge") {
      for (const row of rows) assert.equal(row.response.output, row.prompt.raw);
    }
  });
}
