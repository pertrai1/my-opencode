const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

let quality;

test.before(async () => {
  quality = await import("../scripts/quality-verification.mjs");
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "quality-verification-"));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}

test.afterEach(() => {
  process.chdir(path.resolve(__dirname, ".."));
});

test("parseArgs selects checks and rejects unsupported options", () => {
  assert.deepEqual(quality.parseArgs(["--check", "loc", "--check", "types"]).checks, ["loc", "types"]);
  assert.equal(quality.parseArgs(["--changed"]).changed, true);
  assert.deepEqual(quality.parseArgs(["--fallow-arg", "--top", "--fallow-arg", "10"]).fallowArgs, ["--top", "10"]);
  assert.deepEqual(quality.parseArgs(["--test-arg", "--test-name-pattern", "--test-arg", "quality"]).testArgs, ["--test-name-pattern", "quality"]);
  assert.throws(() => quality.parseArgs(["--changed", "--target", "plugins"]), /cannot be combined/);
  assert.throws(() => quality.parseArgs(["--check", "missing"]), /Unknown check/);
  assert.throws(() => quality.parseArgs(["--wrong"]), /Unknown option/);
  assert.throws(() => quality.parseArgs(["--fallow-arg", "--max-depth"]), /Unsupported --fallow-arg/);
  assert.throws(() => quality.parseArgs(["--fallow-arg", "--top", "--fallow-arg", "0"]), /Invalid value/);
  assert.throws(() => quality.parseArgs(["--test-arg", "--watch"]), /Unsupported --test-arg/);
});

test("parseFallow reports dead-code category findings", () => {
  const results = quality.parseFallow({
    code: 0,
    stdout: JSON.stringify({ unused_exports: [{ file: "unused.ts", name: "unused" }] }),
    stderr: "",
  }, ["dead-code"], ["unused.ts"]);
  assert.equal(results.length, 1);
  const result = results.at(0);
  assert.equal(result?.status, "fail");
  assert.equal(result?.value, 1);
  assert.deepEqual(result?.paths, ["unused.ts"]);
});

test("parseFallow enforces strict complexity and CRAP thresholds", () => {
  const results = quality.parseFallow({
    code: 0,
    stdout: JSON.stringify({ kind: "health", findings: [
      { path: "threshold.ts", cyclomatic: 21, cognitive: 22, crap: 24, coverage_source: "istanbul" },
      { path: "crap.ts", cyclomatic: 1, cognitive: 1, crap: 25, coverage_source: "istanbul" },
    ] }),
    stderr: "",
  }, ["cyclomatic", "cognitive", "crap"], ["threshold.ts", "crap.ts"]);
  assert.equal(results.find((result) => result.check === "cyclomatic")?.status, "pass");
  assert.equal(results.find((result) => result.check === "cognitive")?.status, "fail");
  assert.equal(results.find((result) => result.check === "crap")?.status, "fail");
});

test("parseFallow reports duplicate clone groups", () => {
  const results = quality.parseFallow({
    code: 0,
    stdout: JSON.stringify({ clone_groups: [{ instances: [{ file: "copy.ts" }, { file: "other.ts" }] }] }),
    stderr: "",
  }, ["duplicates"], ["copy.ts"]);
  assert.equal(results.at(0)?.status, "fail");
  assert.equal(results.at(0)?.value, 1);
});

test("parseFallow preserves valid findings from a failing analyzer exit", () => {
  const results = quality.parseFallow({
    code: 1,
    stdout: JSON.stringify({ kind: "health", findings: [{ path: "complex.ts", crap: 25, coverage_source: "istanbul" }] }),
    stderr: "",
  }, ["crap"], ["complex.ts"]);
  assert.equal(results.length, 1);
  assert.equal(results.at(0)?.status, "fail");
});

test("parseFallow rejects estimated CRAP scores", () => {
  const results = quality.parseFallow({
    code: 1,
    stdout: JSON.stringify({ kind: "health", findings: [{ path: "complex.ts", crap: 25, coverage_source: "estimated" }] }),
    stderr: "",
  }, ["crap"], ["complex.ts"]);
  assert.equal(results.length, 1);
  assert.equal(results.at(0)?.status, "error");
});

test("parseFallow rejects estimated CRAP below the quality threshold", () => {
  const results = quality.parseFallow({
    code: 1,
    stdout: JSON.stringify({ kind: "health", findings: [{ path: "simple.ts", crap: 2, coverage_source: "estimated" }] }),
    stderr: "",
  }, ["crap"], ["simple.ts"]);
  assert.equal(results.length, 1);
  assert.equal(results.at(0)?.status, "error");
});

test("testCommand selects the target package manager", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
  fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  assert.deepEqual(quality.testCommand(root), ["pnpm", "test"]);
  fs.rmSync(root, { recursive: true, force: true });
});

test("testCommand honors packageManager and runs Bun package scripts", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ packageManager: "bun@1.2.0", scripts: { test: "node --test" } }));
  fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  assert.deepEqual(quality.testCommand(root), ["bun", "run", "test"]);
  fs.rmSync(root, { recursive: true, force: true });
});

test("testCommand rejects ambiguous package manager lockfiles", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  fs.writeFileSync(path.join(root, "yarn.lock"), "");
  assert.throws(() => quality.testCommand(root), /Ambiguous package manager/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("testCommand rejects npm and pnpm lockfile conflicts", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "package-lock.json"), "{}");
  fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  assert.throws(() => quality.testCommand(root), /Ambiguous package manager/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("fallow receives measured coverage before evaluating CRAP", () => {
  const root = fixture();
  const coveragePath = path.join(root, "coverage-final.json");
  fs.writeFileSync(coveragePath, "{}");
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "quality-verification-bin-"));
  const npx = path.join(bin, "npx");
  fs.writeFileSync(npx, [
    "#!/usr/bin/env node",
    "const args = process.argv.slice(2);",
    "if (!args.includes('--coverage')) process.exit(9);",
    "process.stdout.write(JSON.stringify({ kind: 'health', findings: [] }));",
  ].join("\n"));
  fs.chmodSync(npx, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${bin}:${originalPath}`;
  try {
    const results = quality.fallow(root, ["crap"], [], ["entry.js"], coveragePath);
    assert.equal(results.length, 1);
    assert.equal(results.at(0)?.status, "pass");
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(bin, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("normalizeCoverage converts ignored counters for Fallow", () => {
  assert.deepEqual(quality.normalizeCoverage({
    "source.ts": { b: { 0: [-1, 1] }, s: { 0: 0 } },
  }), {
    "source.ts": { b: { 0: [1, 1] }, s: { 0: 0 } },
  });
});

test("coverageCommand uses one c8 include option per source file", () => {
  const args = quality.coverageCommand("/target", "/reports", ["one.ts", "two.ts"], []);
  const includes = args.flatMap((value, index) => value === "--include" ? [args[index + 1]] : []);
  assert.deepEqual(includes, ["one.ts", "two.ts"]);
});

test("coverageCommand forwards selected-test arguments", () => {
  const args = quality.coverageCommand("/target", "/reports", ["one.ts"], ["tests/one.test.js"]);
  assert.deepEqual(args.slice(-2), ["--", "tests/one.test.js"]);
});

test("evaluateCoverage requires all four coverage dimensions", () => {
  const root = "/target";
  const failing = quality.evaluateCoverage(root, { "/target/one.ts": { l: { 0: 1 }, b: { 0: [1, 0] }, f: { 0: 1 }, s: { 0: 1 } } }, ["one.ts"]);
  const passing = quality.evaluateCoverage(root, { "/target/one.ts": { l: { 0: 1 }, b: { 0: [1, 1] }, f: { 0: 1 }, s: { 0: 1 } } }, ["one.ts"]);
  assert.equal(failing.status, "fail");
  assert.equal(passing.status, "pass");
});

test("evaluateCoverage fails when a required dimension is unavailable", () => {
  const result = quality.evaluateCoverage("/target", { "/target/one.ts": { l: { 0: 1 }, b: { 0: [1] }, f: { 0: 1 } } }, ["one.ts"]);
  assert.equal(result.status, "fail");
});

test("evaluateHalstead enforces the strict difficulty threshold", () => {
  assert.equal(quality.evaluateHalstead({ "one.ts": { difficulty: 79.9 } }, ["one.ts"]).status, "pass");
  assert.equal(quality.evaluateHalstead({ "one.ts": { difficulty: 80 } }, ["one.ts"]).status, "fail");
});

test("lineCount does not count a trailing newline as a line", () => {
  assert.equal(quality.lineCount("line\n".repeat(499)), 499);
  assert.equal(quality.lineCount("line\n".repeat(500)), 500);
});

test("discoverSources includes staged, unstaged, and untracked source files", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "staged.js"), "export const staged = 1;\n");
  execFileSync("git", ["add", "staged.js"], { cwd: root });
  fs.writeFileSync(path.join(root, "unstaged.ts"), "export const unstaged = 1;\n");
  fs.writeFileSync(path.join(root, "untracked.tsx"), "export const untracked = <div />;\n");
  assert.deepEqual(quality.discoverSources(root), ["staged.js", "unstaged.ts", "untracked.tsx"]);
  fs.rmSync(root, { recursive: true, force: true });
});

test("targetSources excludes untracked files covered by .gitignore", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, ".gitignore"), "ignored.js\n");
  fs.writeFileSync(path.join(root, "included.ts"), "export const included = 1;\n");
  fs.writeFileSync(path.join(root, "ignored.js"), "export const ignored = 1;\n");
  assert.deepEqual(quality.targetSources(root, "."), ["included.ts"]);
  fs.rmSync(root, { recursive: true, force: true });
});

test("targetSources excludes tracked files newly covered by .gitignore", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "ignored.js"), "export const ignored = 1;\n");
  execFileSync("git", ["add", "ignored.js"], { cwd: root });
  fs.writeFileSync(path.join(root, ".gitignore"), "ignored.js\n");
  assert.deepEqual(quality.targetSources(root, "."), []);
  fs.rmSync(root, { recursive: true, force: true });
});

test("targetSources honors .gitignore outside a Git repository", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "quality-verification-no-git-"));
  fs.writeFileSync(path.join(root, ".gitignore"), "ignored.js\n");
  fs.writeFileSync(path.join(root, "ignored.js"), "export const ignored = 1;\n");
  fs.writeFileSync(path.join(root, "included.js"), "export const included = 1;\n");
  assert.deepEqual(quality.targetSources(root, "."), ["included.js"]);
  fs.rmSync(root, { recursive: true, force: true });
});

test("targetSources honors nested .gitignore files outside a Git repository", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "quality-verification-no-git-"));
  fs.mkdirSync(path.join(root, "nested"));
  fs.writeFileSync(path.join(root, "nested", ".gitignore"), "ignored.js\n");
  fs.writeFileSync(path.join(root, "nested", "ignored.js"), "export const ignored = 1;\n");
  fs.writeFileSync(path.join(root, "nested", "included.js"), "export const included = 1;\n");
  assert.deepEqual(quality.targetSources(root, "."), ["nested/included.js"]);
  fs.rmSync(root, { recursive: true, force: true });
});

test("targetSources rejects targets outside the worktree", () => {
  const root = fixture();
  assert.throws(() => quality.targetSources(root, ".."), /outside the target worktree/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("targetSources rejects symlinks that escape the worktree", () => {
  const root = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "quality-verification-outside-"));
  fs.writeFileSync(path.join(outside, "outside.js"), "export const outside = 1;\n");
  fs.symlinkSync(outside, path.join(root, "linked"));
  assert.throws(() => quality.targetSources(root, "linked"), /outside the target worktree/);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

test("Fallow diagnostics omit source fragments", () => {
  const results = quality.parseFallow({
    code: 0,
    stdout: JSON.stringify({ clone_groups: [{ instances: [{ file: "copy.ts", fragment: "const secret = 'value'" }] }] }),
    stderr: "",
  }, ["duplicates"], ["copy.ts"]);
  assert.equal(results.length, 1);
  assert.doesNotMatch(results.at(0)?.diagnostic ?? "", /secret/);
});

test("main writes a report before returning a quality failure", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "long.js"), `${"const value = 1;\n".repeat(500)}`);
  process.chdir(root);
  assert.equal(quality.main(["--check", "loc"]), 1);
  const reports = fs.readdirSync(path.join(root, ".agents", "reports"));
  const jsonReport = reports.find((file) => file.endsWith(".json"));
  const markdownReport = reports.find((file) => file.endsWith(".md"));
  assert.ok(jsonReport);
  assert.ok(markdownReport);
  const report = JSON.parse(fs.readFileSync(path.join(root, ".agents", "reports", jsonReport), "utf8"));
  assert.equal(report.overallStatus, "fail");
  assert.equal(report.results[0].check, "loc");
  assert.equal(report.results[0].threshold, "< 500 lines");
  assert.match(fs.readFileSync(path.join(root, ".agents", "reports", markdownReport), "utf8"), /Recommended resolution/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("main reports explicit TypeScript any and unknown types", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "unsafe.ts"), "const first: any = 1; const second: unknown = first;\n");
  process.chdir(root);
  assert.equal(quality.main(["--check", "types"]), 1);
  const reportFile = fs.readdirSync(path.join(root, ".agents", "reports")).find((file) => file.endsWith(".json"));
  const report = JSON.parse(fs.readFileSync(path.join(root, ".agents", "reports", reportFile), "utf8"));
  assert.equal(report.results.at(0)?.status, "fail");
  fs.rmSync(root, { recursive: true, force: true });
});

test("main writes a passing default-suite report for a clean worktree", () => {
  const root = fixture();
  process.chdir(root);
  assert.equal(quality.main([]), 0);
  const reportFile = fs.readdirSync(path.join(root, ".agents", "reports")).find((file) => file.endsWith(".json"));
  const report = JSON.parse(fs.readFileSync(path.join(root, ".agents", "reports", reportFile), "utf8"));
  assert.equal(report.overallStatus, "pass");
  assert.deepEqual(report.selectedChecks, ["cyclomatic", "cognitive", "halstead", "loc", "coverage", "crap", "dead-code", "duplicates", "types"]);
  assert.equal(report.results.length, report.selectedChecks.length);
  fs.rmSync(root, { recursive: true, force: true });
});

test("main runs only selected checks", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "entry.js"), "export const entry = 1;\n");
  process.chdir(root);
  assert.equal(quality.main(["--check", "loc"]), 0);
  const reportFile = fs.readdirSync(path.join(root, ".agents", "reports")).find((file) => file.endsWith(".json"));
  const report = JSON.parse(fs.readFileSync(path.join(root, ".agents", "reports", reportFile), "utf8"));
  assert.deepEqual(report.selectedChecks, ["loc"]);
  assert.deepEqual(report.results.map((result) => result.check), ["loc"]);
  fs.rmSync(root, { recursive: true, force: true });
});

test("main reports Bun coverage as unsupported without running c8", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ packageManager: "bun@1.2.0" }));
  fs.writeFileSync(path.join(root, "entry.js"), "export const entry = 1;\n");
  process.chdir(root);
  assert.equal(quality.main(["--check", "coverage"]), 1);
  const reportFile = fs.readdirSync(path.join(root, ".agents", "reports")).find((file) => file.endsWith(".json"));
  const report = JSON.parse(fs.readFileSync(path.join(root, ".agents", "reports", reportFile), "utf8"));
  assert.equal(report.results.at(0)?.status, "error");
  assert.match(report.results.at(0)?.diagnostic ?? "", /Bun coverage is not supported/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("CLI help documents supported runner options", () => {
  const runner = path.resolve(__dirname, "..", "scripts", "quality-verification.mjs");
  const result = spawnSync("node", [runner, "--help"], { encoding: "utf8" });
  assert.notEqual(result.status, 2);
  assert.match(result.stdout, /--check/);
  assert.match(result.stdout, /--target/);
});

test("halstead analysis errors when a selected source cannot produce metrics", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "invalid.js"), "function {\n");
  process.chdir(root);
  assert.equal(quality.main(["--check", "halstead"]), 1);
  const reportFile = fs.readdirSync(path.join(root, ".agents", "reports")).find((file) => file.endsWith(".json"));
  const report = JSON.parse(fs.readFileSync(path.join(root, ".agents", "reports", reportFile), "utf8"));
  assert.equal(report.results[0].status, "error");
  fs.rmSync(root, { recursive: true, force: true });
});

test("Fallow analysis does not create a repository cache directory", () => {
  const root = fixture();
  const runner = path.resolve(__dirname, "..", "scripts", "quality-verification.mjs");
  fs.writeFileSync(path.join(root, "entry.js"), "export const entry = 1;\n");
  const result = spawnSync("node", [runner, "--check", "dead-code", "--target", "entry.js"], {
    cwd: root,
    stdio: "ignore",
  });
  assert.notEqual(result.status, 2);
  assert.equal(fs.existsSync(path.join(root, ".fallow")), false);
  const reportFile = fs.readdirSync(path.join(root, ".agents", "reports")).find((file) => file.endsWith(".json"));
  const report = JSON.parse(fs.readFileSync(path.join(root, ".agents", "reports", reportFile), "utf8"));
  assert.equal(report.results.at(0)?.check, "dead-code");
  assert.notEqual(report.results.at(0)?.status, "error");
  fs.rmSync(root, { recursive: true, force: true });
});
