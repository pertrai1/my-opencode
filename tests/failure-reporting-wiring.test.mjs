import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repository = fileURLToPath(new URL("../", import.meta.url));
const caseDirectory = join(repository, "evals/failure-reporting");
const evidence = readFileSync(join(caseDirectory, "evidence.txt"), "utf8").trim();

function captureRequests(t, name) {
  const directory = mkdtempSync(join(tmpdir(), "failure-reporting-wiring-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const provider = join(repository, "tests/fixtures/promptfoo-wiring-provider.js");
  const config = join(directory, `${name}.yaml`);
  const log = join(directory, "requests.jsonl");
  const report = join(directory, "report.json");
  // Preserve the real config's variables, prompts, rubric, tests, and base path.
  // Replace only paid providers with a local recorder and canned rejection.
  const yaml = readFileSync(join(caseDirectory, `${name}.yaml`), "utf8")
    .replaceAll("openai:chat:gpt-4o", `file://${provider}`);
  writeFileSync(config, `${yaml}\nbasePath: ${JSON.stringify(caseDirectory)}\n`);
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
    calls: readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)),
  };
}

for (const [name, judgeCount] of [["judge", 2], ["model", 1]]) {
  test(`${name} config loads full evidence into the rendered prompts offline`, (t) => {
    const { calls, rows } = captureRequests(t, name);
    const judges = calls.filter(call => call.kind === "judge");
    const candidates = calls.filter(call => call.kind === "candidate");
    assert.equal(judges.length, judgeCount);
    assert.equal(rows.length, judgeCount);
    for (const call of judges) {
      assert.equal(call.vars.evidence.trim(), evidence);
      assert.equal(call.prompt.match(/<evidence>\n([\s\S]*?)\n<\/evidence>/)?.[1].trim(), evidence);
      assert.doesNotMatch(call.prompt, /file:\/\/|\{\{evidence\}\}/);
      const candidate = call.prompt.match(/<candidate>\n([\s\S]*?)\n<\/candidate>/)?.[1];
      assert.ok(rows.some(row => row.response.output === candidate));
    }
    assert.equal(candidates.length, name === "model" ? 1 : 0);
    for (const call of candidates) {
      const messages = JSON.parse(call.prompt);
      assert.equal(messages.find(message => message.role === "user")?.content.trim(), evidence);
      assert.match(messages.find(message => message.role === "system")?.content, /^You are the CHANGE-VERIFIER\./);
      assert.doesNotMatch(call.prompt, /file:\/\/|\{\{evidence\}\}/);
    }
    if (name === "judge") {
      for (const row of rows) assert.equal(row.response.output, row.prompt.raw);
    }
  });
}
