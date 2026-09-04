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
  assert.throws(() => quality.parseArgs(["--changed", "--target", "plugins"]), /cannot be combined/);
  assert.throws(() => quality.parseArgs(["--check", "missing"]), /Unknown check/);
  assert.throws(() => quality.parseArgs(["--wrong"]), /Unknown option/);
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
  fs.rmSync(root, { recursive: true, force: true });
});
