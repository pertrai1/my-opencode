const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

let checks;

function fixture({ scripts = {}, packageManager = "npm@10.0.0", lockfile = false, git = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "checks-runner-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ packageManager, scripts }));
  if (lockfile) fs.writeFileSync(path.join(root, "package-lock.json"), "{}");
  if (git) execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}

function reports(root) {
  const directory = path.join(root, ".agents", "reports");
  const files = fs.readdirSync(directory);
  const json = files.filter((file) => file.endsWith(".json")).map((file) => path.join(directory, file));
  const markdown = files.filter((file) => file.endsWith(".md")).map((file) => path.join(directory, file));
  return { json, markdown };
}

function fakeManager() {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "checks-runner-bin-"));
  const executable = path.join(bin, "npm");
  fs.writeFileSync(executable, [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "const stage = process.argv.at(-1);",
    "fs.appendFileSync(process.env.CHECKS_LOG, `${stage}|${process.cwd()}|${process.env.CI}|${process.env.NO_COLOR}\\n`);",
    "const script = JSON.parse(fs.readFileSync('package.json')).scripts[stage];",
    "if (script === 'fail') { process.stderr.write('token=super-secret\\n'); process.exit(5); }",
    "if (script === 'large') process.stdout.write('x'.repeat(40000));",
    "if (script === 'hang') setTimeout(() => process.exit(0), 10000);",
  ].join("\n"));
  fs.chmodSync(executable, 0o755);
  return bin;
}

async function run(root, args = []) {
  const bin = fakeManager();
  const originalPath = process.env.PATH;
  const log = path.join(root, "checks.log");
  process.env.PATH = `${bin}:${originalPath}`;
  process.env.CHECKS_LOG = log;
  try { return await checks.main(args, root); }
  finally { process.env.PATH = originalPath; delete process.env.CHECKS_LOG; fs.rmSync(bin, { recursive: true, force: true }); }
}

test.before(async () => { checks = await import("../scripts/checks-runner.mjs"); });
test.afterEach(() => { process.chdir(path.resolve(__dirname, "..")); });

test("parses target and timeout options and rejects invalid invocation", () => {
  assert.deepEqual(checks.parseArgs(["--target", "work", "--timeout", "4"]), { target: "work", timeoutSeconds: 4, help: false });
  assert.throws(() => checks.parseArgs(["--timeout", "0"]), /positive/);
  assert.throws(() => checks.parseArgs(["--target"]), /Missing/);
  assert.throws(() => checks.parseArgs(["--unknown"]), /Unknown/);
});

test("discovers configured stages and strictly selects a package manager", () => {
  assert.deepEqual(checks.discoverStages({ scripts: { lint: "eslint ." } }), [
    { name: "typecheck", configured: false }, { name: "lint", configured: true }, { name: "test", configured: false },
  ]);
  const root = fixture({ packageManager: "pnpm@9", lockfile: true });
  assert.deepEqual(checks.selectPackageManager(root, checks.readManifest(root)).name, "pnpm");
  fs.rmSync(root, { recursive: true, force: true });
  const ambiguous = fixture({ packageManager: null });
  fs.writeFileSync(path.join(ambiguous, "pnpm-lock.yaml"), "");
  fs.writeFileSync(path.join(ambiguous, "yarn.lock"), "");
  assert.throws(() => checks.selectPackageManager(ambiguous, checks.readManifest(ambiguous)), /Ambiguous/);
  fs.rmSync(ambiguous, { recursive: true, force: true });
});

test("condenses and redacts persisted diagnostic data", () => {
  const output = checks.condenseOutput(`Authorization: Bearer abcdefghijk\ntoken=super-secret\n${"x".repeat(40000)}`);
  assert.equal(output.truncated, true);
  assert.match(output.text, /REDACTED/);
  assert.doesNotMatch(output.text, /super-secret|abcdefghijk/);
  const capture = checks.createOutputCapture(10, 4);
  capture.append("abcd"); capture.append("efghijklmnop");
  assert.deepEqual(capture.result(), { text: "abcd\n[... 6 bytes omitted ...]\nklmnop", truncated: true, omittedBytes: 6 });
});

test("runs configured stages in fixed order and writes paired reports in the target", async () => {
  const root = fixture({ scripts: { typecheck: "ok", lint: "ok", test: "ok" }, git: true });
  assert.equal(await run(root), 0);
  assert.deepEqual(fs.readFileSync(path.join(root, "checks.log"), "utf8").trim().split("\n").map((line) => line.split("|")[0]), ["typecheck", "lint", "test"]);
  const artifact = reports(root);
  assert.equal(artifact.json.length, 1); assert.equal(artifact.markdown.length, 1);
  const report = JSON.parse(fs.readFileSync(artifact.json[0], "utf8"));
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.overallStatus, "passed");
  assert.deepEqual(report.stages.map((stage) => stage.status), ["passed", "passed", "passed"]);
  assert.equal(report.git.before.available, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test("fails fast, records not-run stages, and redacts failure reports", async () => {
  const root = fixture({ scripts: { typecheck: "fail", lint: "ok", test: "ok" } });
  assert.equal(await run(root), 1);
  const report = JSON.parse(fs.readFileSync(reports(root).json[0], "utf8"));
  assert.equal(report.overallStatus, "failed");
  assert.deepEqual(report.stages.map((stage) => stage.status), ["failed", "not-run", "not-run"]);
  assert.doesNotMatch(JSON.stringify(report), /super-secret/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("records missing standard stages, blocks no-check repositories, and supports non-Git targets", async () => {
  const partial = fixture({ scripts: { lint: "ok" } });
  assert.equal(await run(partial), 0);
  const partialReport = JSON.parse(fs.readFileSync(reports(partial).json[0], "utf8"));
  assert.deepEqual(partialReport.stages.map((stage) => stage.status), ["not-configured", "passed", "not-configured"]);
  assert.equal(partialReport.git.before.available, false);
  fs.rmSync(partial, { recursive: true, force: true });
  const blocked = fixture({ scripts: {} });
  assert.equal(await run(blocked), 1);
  assert.equal(JSON.parse(fs.readFileSync(reports(blocked).json[0], "utf8")).overallStatus, "blocked");
  fs.rmSync(blocked, { recursive: true, force: true });
});

test("writes setup-error reports for malformed manifests and falls back when reports cannot persist", async () => {
  const malformed = fs.mkdtempSync(path.join(os.tmpdir(), "checks-runner-malformed-"));
  fs.writeFileSync(path.join(malformed, "package.json"), "{");
  assert.equal(await checks.main([], malformed), 2);
  const malformedReport = JSON.parse(fs.readFileSync(reports(malformed).json[0], "utf8"));
  assert.equal(malformedReport.overallStatus, "error");
  fs.rmSync(malformed, { recursive: true, force: true });

  const unwritable = fixture({ scripts: {} });
  fs.writeFileSync(path.join(unwritable, ".agents"), "not-a-directory");
  assert.equal(await checks.main([], unwritable), 2);
  fs.rmSync(unwritable, { recursive: true, force: true });
});

test("reports timeout errors and creates collision-resistant report paths", async () => {
  const root = fixture({ scripts: { test: "hang" } });
  assert.equal(await run(root, ["--timeout", "1"]), 2);
  assert.equal(await run(root, ["--timeout", "1"]), 2);
  const artifact = reports(root);
  assert.equal(artifact.json.length, 2);
  const report = JSON.parse(fs.readFileSync(artifact.json[0], "utf8"));
  assert.equal(report.overallStatus, "error");
  assert.equal(report.stages.at(-1).status, "error");
  assert.equal(report.stages.at(-1).timedOut, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test("OpenCode prompts invoke the runner and preserve read-only verification", () => {
  const root = path.resolve(__dirname, "..");
  const checksCommand = fs.readFileSync(path.join(root, "commands", "checks.md"), "utf8");
  const verifyCommand = fs.readFileSync(path.join(root, "commands", "verify.md"), "utf8");
  const orchestrator = fs.readFileSync(path.join(root, "agents", "sdlc-orchestrator.md"), "utf8");
  const verifier = fs.readFileSync(path.join(root, "agents", "change-verifier.md"), "utf8");
  assert.match(checksCommand, /checks-runner\.mjs/);
  assert.match(verifyCommand, /checks-<RUN_ID>/);
  assert.match(orchestrator, /"node ~\/\.config\/opencode\/scripts\/checks-runner\.mjs\s\*": allow/);
  assert.match(orchestrator, /repository-state metadata/);
  assert.match(verifier, /bash:\n[ ]{4}"\*": deny/);
  assert.match(verifier, /historical|stale/);
});

test("CLI help is documented and explicit targets do not use harness scripts", () => {
  const runner = path.resolve(__dirname, "..", "scripts", "checks-runner.mjs");
  const help = spawnSync("node", [runner, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0); assert.match(help.stdout, /--target/);
  const root = fixture({ scripts: {} });
  const result = spawnSync("node", [runner, "--target", root], { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.ok(fs.existsSync(reports(root).json[0]));
  fs.rmSync(root, { recursive: true, force: true });
});
