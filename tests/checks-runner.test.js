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
  assert.throws(() => checks.parseArgs(["--timeout", "2147484"]), /maximum/);
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
  assert.deepEqual(capture.result(), { text: "\n[... 6 bytes omitted; boundary lines dropped ...]\n", truncated: true, omittedBytes: 6 });
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
  const summary = fs.readFileSync(artifact.markdown[0], "utf8");
  assert.match(summary, /original POSIX process group/);
  assert.match(summary, /Escaped sessions require external supervision; timeout does not prove all descendants were cleaned up/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("OpenCode prompts invoke the runner and preserve read-only verification", () => {
  const root = path.resolve(__dirname, "..");
  const checksCommand = fs.readFileSync(path.join(root, "commands", "checks.md"), "utf8");
  const verifyCommand = fs.readFileSync(path.join(root, "commands", "verify.md"), "utf8");
  const orchestrator = fs.readFileSync(path.join(root, "agents", "sdlc-orchestrator.md"), "utf8");
  const verifier = fs.readFileSync(path.join(root, "agents", "change-verifier.md"), "utf8");
  const tdd = fs.readFileSync(path.join(root, "agents", "tdd-orchestrator.md"), "utf8");
  assert.match(checksCommand, /checks-runner\.mjs/);
  assert.match(verifyCommand, /checks-<RUN_ID>/);
  for (const source of [orchestrator, tdd]) {
    const frontmatter = source.split("\n---")[0];
    assert.match(frontmatter, /bash:\n[ ]{4}"\*": deny/);
    const runnerRules = frontmatter.split("\n").filter((line) => line.includes("checks-runner.mjs"));
    assert.deepEqual(runnerRules, ['    "node ~/.config/opencode/scripts/checks-runner.mjs": allow']);
    assert.match(source, /authorized `build` session or a user decision/);
  }
  assert.match(orchestrator, /repository-state metadata/);
  assert.match(verifier, /bash:\n[ ]{4}"\*": deny/);
  assert.match(verifier, /historical|stale/);
  assert.match(tdd.split("\n---")[0], /"node ~\/\.config\/opencode\/scripts\/checks-runner\.mjs": allow/);
  assert.match(verifyCommand, /~\/\.config\/opencode\/\.agents\/docs\/verification\/README\.md/);
  assert.match(verifyCommand, /~\/\.config\/opencode\/\.agents\/docs\/verification\/TEMPLATE\.md/);
  assert.match(verifyCommand, /--no-comment.*takes precedence over `--comment`/);
  assert.match(verifyCommand, /Skip commenting by default/);
  assert.match(verifyCommand, /target command directory's `\.agents\/reports\/`/);
  assert.doesNotMatch(orchestrator, /You run in the OpenCode harness repository/);
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

test("explicit argv commands replace Node defaults in an external non-Node target", async (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.rmSync(path.join(root, "package.json"));
  const argv = ["--target", root, "--command", '["/bin/sh","-c","pwd; printf \'token=private-value\\n\'"]', "--command", '["/bin/true","--token","argument-secret"]'];
  assert.equal(await checks.main(argv, path.resolve(__dirname, "..")), 0);
  const raw = fs.readFileSync(reports(root).json[0], "utf8");
  const report = JSON.parse(raw);
  assert.equal(report.targetRoot, fs.realpathSync(root));
  assert.equal(report.toolchain.packageManager, null);
  assert.equal(report.toolchain.platform, process.platform);
  assert.match(report.toolchain.runnerSha256, /^[a-f0-9]{64}$/);
  assert.equal(report.environment.CI, process.env.CI ?? "1");
  assert.deepEqual(report.stages.map((stage) => stage.status), ["passed", "passed"]);
  assert.match(report.stages[0].stdout.text, new RegExp(root));
  assert.ok(report.stages[0].tool.path);
  assert.doesNotMatch(raw, /private-value|argument-secret/);
  assert.doesNotMatch(fs.readFileSync(reports(root).markdown[0], "utf8"), /private-value|argument-secret/);
  assert.equal(report.git.before.available, false);
  assert.equal(report.evidence.unchanged, false);
  for (const value of ['{}', '[]', '[1]', '[""]', 'not-json']) assert.throws(() => checks.parseArgs(["--command", value]), /--command/);
});

test("nested command directory preserves Git root and fingerprints dirty content, not status alone", async (t) => {
  const root = fixture({ git: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nested = path.join(root, "packages", "app");
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(root, ".gitignore"), "ignored\n");
  fs.writeFileSync(path.join(root, "tracked file"), "initial");
  execFileSync("git", ["add", "."], { cwd: root });
  fs.writeFileSync(path.join(root, "tracked file"), "dirty one");
  fs.writeFileSync(path.join(root, "untracked\nfile"), "one");
  const before = checks.gitState(nested);
  fs.writeFileSync(path.join(root, "tracked file"), "dirty two");
  const tracked = checks.gitState(nested);
  assert.deepEqual(before.paths, tracked.paths);
  assert.notEqual(before.fingerprint, tracked.fingerprint);
  fs.writeFileSync(path.join(root, "untracked\nfile"), "two");
  const untracked = checks.gitState(nested);
  assert.notEqual(tracked.fingerprint, untracked.fingerprint);
  fs.writeFileSync(path.join(root, "ignored"), "ignored content");
  fs.mkdirSync(path.join(nested, ".agents", "reports"), { recursive: true });
  fs.writeFileSync(path.join(nested, ".agents", "reports", "old.json"), "{}");
  assert.equal(checks.gitState(nested).fingerprint, untracked.fingerprint);
  const args = ["--command", '["/bin/pwd"]'];
  assert.equal(await checks.main(args, nested), 0);
  const report = JSON.parse(fs.readFileSync(reports(nested).json.find((file) => !file.endsWith("old.json")), "utf8"));
  assert.equal(report.targetRoot, nested);
  assert.equal(report.git.before.root, root);
  assert.equal(report.evidence.unchanged, true);
  assert.equal(report.git.before.fingerprint, report.git.after.fingerprint);
  assert.equal(report.stages[0].stdout.text.trim(), nested);
  fs.unlinkSync(path.join(root, "tracked file"));
  assert.notEqual(checks.gitState(nested).fingerprint, untracked.fingerprint);
});

test("commands mutating source invalidate evidence and explicit failures stop later commands", async (t) => {
  const root = fixture({ git: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(await checks.main(["--command", '["/bin/sh","-c","printf changed > source"]', "--command", '["/bin/false"]', "--command", '["/bin/touch","should-not-exist"]'], root), 1);
  const report = JSON.parse(fs.readFileSync(reports(root).json[0], "utf8"));
  assert.equal(report.evidence.unchanged, false);
  assert.deepEqual(report.stages.map((stage) => stage.status), ["passed", "failed", "not-run"]);
  assert.equal(fs.existsSync(path.join(root, "should-not-exist")), false);
});

test("bounded logs redact split secrets and drop unsafe cut lines", () => {
  const capture = checks.createOutputCapture();
  capture.append("token=split-"); capture.append("secret\n");
  capture.append("x".repeat(40000)); capture.append("\npassword=last-secret\n");
  const output = capture.result();
  assert.equal(output.truncated, true);
  assert.ok(Buffer.byteLength(output.text) < 33000);
  assert.doesNotMatch(output.text, /split-secret|last-secret/);
  assert.match(output.text, /REDACTED/);
  assert.doesNotMatch(checks.redact("-----BEGIN PRIVATE KEY-----\nprivate material"), /private material/);
});

test("timeout kills a TERM-resistant descendant remaining in the original process group", { skip: process.platform === "win32", timeout: 10000 }, async (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const started = Date.now();
  const command = { executable: "/bin/sh", args: ["-c", "(trap '' TERM; sleep 3; touch survived) & wait"], display: "timeout tree" };
  const result = await checks.runCommand(command, root, 1);
  assert.equal(result.timedOut, true);
  assert.equal(result.status, "error");
  assert.ok(Date.now() - started < 3000);
  await new Promise((resolve) => setTimeout(resolve, 2200));
  assert.equal(fs.existsSync(path.join(root, "survived")), false);
});

test("real Node defaults run in an external target, not the harness", async (t) => {
  const root = fixture({ scripts: { test: 'node -e "console.log(process.cwd())"' } });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(await checks.main(["--target", root], path.resolve(__dirname, "..")), 0);
  const report = JSON.parse(fs.readFileSync(reports(root).json[0], "utf8"));
  assert.deepEqual(report.stages.map((stage) => stage.status), ["not-configured", "not-configured", "passed"]);
  assert.ok(report.stages.at(-1).stdout.text.includes(root));
});

test("argv stays literal without an implicit shell and missing executables produce error reports", async (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const literal = await checks.runCommand({ executable: process.execPath, args: ["-e", "console.log(process.argv[1])", "; touch injected"], display: "literal argv" }, root, 2);
  assert.equal(literal.status, "passed");
  assert.equal(literal.stdout.text.trim(), "; touch injected");
  assert.equal(fs.existsSync(path.join(root, "injected")), false);
  assert.equal(await checks.main(["--command", '["./missing-executable"]'], root), 2);
  const report = JSON.parse(fs.readFileSync(reports(root).json[0], "utf8"));
  assert.equal(report.stages[0].status, "error");
  assert.equal(report.stages[0].tool, null);
  assert.match(report.stages[0].error, /ENOENT/);
});

test("fingerprints include renames, executable modes and symlinks, and fail closed for unsupported entries", (t) => {
  const root = fixture({ git: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "source");
  fs.writeFileSync(file, "same content");
  const initial = checks.gitState(root).fingerprint;
  fs.chmodSync(file, 0o755);
  assert.notEqual(checks.gitState(root).fingerprint, initial);
  fs.symlinkSync("source", path.join(root, "link"));
  const linked = checks.gitState(root).fingerprint;
  fs.unlinkSync(path.join(root, "link"));
  fs.symlinkSync("other", path.join(root, "link"));
  assert.notEqual(checks.gitState(root).fingerprint, linked);
  const beforeRename = checks.gitState(root).fingerprint;
  fs.renameSync(file, path.join(root, "renamed"));
  assert.notEqual(checks.gitState(root).fingerprint, beforeRename);
  execFileSync("git", ["add", "."], { cwd: root });
  fs.unlinkSync(path.join(root, "renamed"));
  fs.mkdirSync(path.join(root, "renamed"));
  const unsupported = checks.gitState(root);
  assert.equal(unsupported.fingerprint, null);
  assert.match(unsupported.fingerprintError, /Unsupported fingerprint entry/);
});

test("persisted stdout and stderr stay bounded and redacted on success", async (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const script = "for (const stream of [process.stdout, process.stderr]) { stream.write('token=log-secret\\n'); stream.write('line\\n'.repeat(20000)); stream.write('password=end-secret\\n'); }";
  assert.equal(await checks.main(["--command", JSON.stringify([process.execPath, "-e", script])], root), 0);
  const raw = fs.readFileSync(reports(root).json[0], "utf8");
  const report = JSON.parse(raw);
  for (const output of [report.stages[0].stdout, report.stages[0].stderr]) {
    assert.equal(output.truncated, true);
    assert.ok(Buffer.byteLength(output.text) < 33000);
    assert.match(output.text, /REDACTED/);
  }
  assert.doesNotMatch(raw, /log-secret|end-secret/);
  assert.equal(fs.statSync(reports(root).json[0]).mode & 0o777, 0o600);
});

test("index-only staging invalidates evidence without changing filesystem contents", async (t) => {
  const root = fixture({ git: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "existing\tfile");
  fs.writeFileSync(file, "original");
  execFileSync("git", ["add", "."], { cwd: root });
  fs.writeFileSync(file, "changed");
  const before = checks.gitState(root);
  assert.equal(await checks.main(["--command", JSON.stringify(["git", "add", "existing\tfile"])], root), 0);
  const after = checks.gitState(root);
  assert.equal(fs.readFileSync(file, "utf8"), "changed");
  assert.deepEqual(before.paths, after.paths);
  assert.notEqual(before.fingerprint, after.fingerprint);
  const report = JSON.parse(fs.readFileSync(reports(root).json[0], "utf8"));
  assert.equal(report.evidence.unchanged, false);
  const excluded = path.join(root, ".agents", "reports", "tracked.txt");
  fs.writeFileSync(excluded, "one");
  execFileSync("git", ["add", ".agents/reports/tracked.txt"], { cwd: root });
  assert.equal(checks.gitState(root).fingerprint, after.fingerprint);
  fs.writeFileSync(excluded, "two");
  execFileSync("git", ["add", ".agents/reports/tracked.txt"], { cwd: root });
  assert.equal(checks.gitState(root).fingerprint, after.fingerprint);
});

test("quoted secrets with spaces are fully redacted in persisted diagnostics", async (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const quote of ['"', "'"]) {
    assert.equal(checks.redact(`password=${quote}correct horse battery staple${quote}`), `password=${quote}[REDACTED]${quote}`);
  }
  fs.writeFileSync(path.join(root, "secret-log.cjs"), `console.error('password="correct horse battery staple"'); process.exitCode = 1;`);
  assert.equal(await checks.main(["--command", JSON.stringify([process.execPath, "secret-log.cjs"])], root), 1);
  for (const file of [...reports(root).json, ...reports(root).markdown]) {
    const raw = fs.readFileSync(file, "utf8");
    assert.match(raw, /REDACTED/);
    assert.doesNotMatch(raw, /correct|horse|battery|staple/);
  }
});
