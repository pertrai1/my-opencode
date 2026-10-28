import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";
import yaml from "js-yaml";
import prompt from "../evals/learn/prompt.js";

const repository = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(join(repository, path), "utf8");
const original = yaml.load(read("evals/learn/promptfooconfig.yaml"));
const settings = {
  LEARN_BENCHMARK_PROVIDER: "openai:chat:gpt-6.1-sol",
  LEARN_BENCHMARK_REASONING_EFFORT: "high",
};
// The production config deliberately has no implicit model settings.
const importSettings = { ...settings, LEARN_BASELINE_REF: "HEAD" };
const saved = Object.fromEntries(Object.keys(importSettings).map(key => [key, process.env[key]]));
Object.assign(process.env, importSettings);
const { createBenchmark } = await import("../evals/learn/benchmark.mjs");
for (const [key, value] of Object.entries(saved)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
const git = (args, root) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function snapshotRepository(t, command = read("commands/learn.md")) {
  const root = mkdtempSync(join(tmpdir(), "learn-snapshot-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "commands"));
  // Isolated fixture history also works with CI's shallow checkout.
  git(["init", "--quiet", "--initial-branch=main"], root);
  const commit = ["-c", "user.name=Benchmark Test", "-c", "user.email=benchmark-test@example.invalid", "commit", "--quiet"];
  git([...commit, "--allow-empty", "-m", "Before learn exists"], root);
  writeFileSync(join(root, "commands/learn.md"), read("commands/learn.md"));
  git(["add", "commands/learn.md"], root);
  git([...commit, "-m", "Baseline learn instructions"], root);
  git(["update-ref", "refs/remotes/origin/main", "HEAD"], root);
  writeFileSync(join(root, "commands/learn.md"), command);
  return root;
}

test("prompt comparison preserves fixed cases, assertions and one explicitly configured provider", (t) => {
  const root = snapshotRepository(t);
  const config = createBenchmark({ root, env: settings });
  for (const field of ["tests", "defaultTest", "evaluateOptions"]) {
    assert.deepEqual(config[field], original[field], field);
  }
  assert.equal(config.providers.length, 1);
  const expectedConfig = { ...original.providers[0].config, reasoning_effort: "high", max_completion_tokens: 25_000 };
  delete expectedConfig.max_tokens;
  assert.deepEqual(config.providers, [{
    ...original.providers[0], id: settings.LEARN_BENCHMARK_PROVIDER,
    config: expectedConfig,
  }]);
  assert.equal(original.providers[0].config.max_tokens, 600);
  assert.equal(original.providers[0].config.max_completion_tokens, undefined);
  assert.equal(config.providers[0].transform, undefined);
  assert.match(config.description, new RegExp(git(["rev-parse", "origin/main"], root)));
});

test("baseline revision and working copy are independent immutable prompt snapshots", (t) => {
  const command = read("commands/learn.md").replace("Analyze this session", "Working-copy marker. Analyze this session");
  const root = snapshotRepository(t, command);
  const config = createBenchmark({ root, env: { ...settings, LEARN_BASELINE_REF: "main" } });
  const vars = {
    session: "one snapshot", repository_evidence: "one evidence", existing_guidance: "one guidance",
    expected: "DO_NOT_SEND_LABELS", semantic_review: "DO_NOT_SEND_NOTES",
  };
  const [baseline = {}, candidate = {}] = config.prompts;
  const before = baseline.function({ vars });
  const after = candidate.function({ vars });
  assert.notDeepEqual(before, after);
  assert.deepEqual(after, prompt.fromCommand(command, { vars }));
  assert.deepEqual(before, prompt.fromCommand(git(["show", "main:commands/learn.md"], root), { vars }));
  assert.deepEqual(before[1], after[1]);
  assert.doesNotMatch(JSON.stringify([before, after]), /DO_NOT_SEND_/);
  const revision = git(["rev-parse", "main"], root);
  assert.match(config.description, new RegExp(revision));
  assert.ok(config.description.includes(createHash("sha256").update(command).digest("hex")));
  const byCommit = createBenchmark({ root, env: { ...settings, LEARN_BASELINE_REF: revision } });
  assert.deepEqual(byCommit.prompts.map(version => version.function({ vars })), [before, after]);
  writeFileSync(join(root, "commands/learn.md"), "later edit");
  git(["update-ref", "refs/heads/main", "HEAD^"], root);
  assert.deepEqual(candidate.function({ vars }), after);
  assert.deepEqual(baseline.function({ vars }), before);
});

test("missing or blank settings, invalid provider/effort and unresolved versions fail before calls", (t) => {
  const root = snapshotRepository(t);
  for (const key of Object.keys(settings)) {
    for (const value of [undefined, "", "   "]) {
      assert.throws(() => createBenchmark({ root, env: { ...settings, [key]: value } }), new RegExp(key));
    }
  }
  for (const env of [
    { LEARN_BENCHMARK_PROVIDER: "openai/gpt-6.1-sol#high" },
    { LEARN_BENCHMARK_PROVIDER: "openai:chat:" },
    { LEARN_BENCHMARK_REASONING_EFFORT: "guess" },
    { LEARN_BASELINE_REF: " " },
    { LEARN_BASELINE_REF: "refs/heads/learn-test-ref-does-not-exist" },
    { LEARN_BASELINE_REF: "HEAD^" }, // Valid fixture commit before commands/learn.md existed.
    { LEARN_BASELINE_REF: git(["rev-parse", "HEAD:commands/learn.md"], root) },
  ]) assert.throws(() => createBenchmark({ root, env: { ...settings, ...env } }));
  for (const command of ["", "no front matter", "---\ndescription: empty\n---\n$ARGUMENTS"]) {
    assert.throws(() => createBenchmark({ root: snapshotRepository(t, command), env: settings }), /Expected/);
  }
});

test("pinned OpenAI provider emits configured reasoning and JSON settings without calling a model", async (t) => {
  const { loadApiProvider } = await import("promptfoo");
  const config = createBenchmark({ root: snapshotRepository(t), env: settings });
  const [provider = {}] = config.providers;
  const api = await loadApiProvider(provider.id, { options: provider });
  const { body } = await api.getOpenAiBody(JSON.stringify([{ role: "user", content: "JSON only" }]));
  assert.equal(body.model, "gpt-6.1-sol");
  assert.equal(body.reasoning_effort, "high");
  assert.deepEqual(body.response_format, original.providers[0].config.response_format);
  assert.equal(body.max_completion_tokens, 25_000);
  assert.equal(body.max_tokens, undefined);
  assert.equal(body.temperature, undefined); // Pinned provider applies reasoning-model restrictions.
});

test("actual offline CLI sends both prompt versions on every case and repeat without answer leakage", (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "learn-benchmark-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const report = join(temporary, "report.json");
  const capture = join(temporary, "requests.jsonl");
  const command = read("commands/learn.md").replace("Analyze this session", "Working-copy marker. Analyze this session");
  const root = snapshotRepository(t, command);
  const configPath = join(temporary, "config.mjs");
  writeFileSync(configPath, `import { createBenchmark } from ${JSON.stringify(new URL("../evals/learn/benchmark.mjs", import.meta.url).href)};\nexport default { ...createBenchmark({ root: ${JSON.stringify(root)} }), basePath: ${JSON.stringify(join(repository, "evals/learn"))} };\n`);
  const result = spawnSync(process.execPath, [
    "--require", join(repository, "evals/failure-reporting/offline.js"),
    join(repository, "node_modules/promptfoo/dist/src/entrypoint.js"),
    "eval", "-c", configPath, "--repeat", "2",
    "--providers", `file://${join(repository, "tests/fixtures/promptfoo-wiring-provider.js")}`,
    "--no-cache", "--no-write", "--no-share", "--no-progress-bar", "--no-table", "-o", report,
  ], {
    cwd: repository, encoding: "utf8", timeout: 60_000,
    env: {
      ...process.env, ...settings, LEARN_BASELINE_REF: "HEAD",
      PROMPTFOO_CONFIG_DIR: join(temporary, "state"), PROMPTFOO_CAPTURE_LOG: capture,
      PROMPTFOO_DISABLE_TELEMETRY: "1", PROMPTFOO_DISABLE_UPDATE: "1",
    },
  });
  assert.equal(result.status, 100, result.stdout + result.stderr);
  const { stats, results } = JSON.parse(readFileSync(report, "utf8")).results;
  assert.equal(stats.errors, 0);
  assert.equal(stats.successes, 0);
  assert.equal(stats.failures, 40); // Existing capture stub returns placeholders, not model decisions.
  const calls = readFileSync(capture, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(calls.length, 40);
  assert.ok(calls.every(({ prompt }) => !/"expected"|"semantic_review"/.test(prompt)));
  const cases = yaml.load(read("evals/learn/examples.yaml"));
  const config = createBenchmark({ root, env: settings });
  for (const { vars } of cases) {
    const batch = calls.filter(call => call.vars.id === vars.id);
    assert.equal(batch.length, 4);
    for (const version of config.prompts) {
      assert.equal(batch.filter(call => JSON.stringify(JSON.parse(call.prompt)) === JSON.stringify(version.function({ vars }))).length, 2);
    }
    for (const prefix of ["baseline", "working copy"]) {
      assert.equal(results.filter(row => row.testCase.vars.id === vars.id && row.prompt.label.startsWith(prefix)).length, 2);
    }
  }
});
