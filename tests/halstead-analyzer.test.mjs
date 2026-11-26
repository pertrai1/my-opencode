import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const analyzer = fileURLToPath(new URL("../scripts/halstead-analyzer.js", import.meta.url));

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "halstead-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "pipe" });
  git("init", "--quiet");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "--quiet", "-m", "baseline");
  return { cwd, git, run: (...args) => spawnSync(process.execPath, [analyzer, ...args], { cwd, encoding: "utf8" }) };
}

test("changed mode calculates and exports real Halstead counts for a spaced .mjs path", t => {
  const { cwd, run } = fixture(t);
  const file = "some code -> example.mjs";
  writeFileSync(join(cwd, file), "const x = 1 + 1; // ignored\n");
  const result = run("--git-changed", "--out", "reports/data.json");
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`FILE: ${file}`));
  const report = JSON.parse(readFileSync(join(cwd, "reports/data.json"), "utf8"));
  assert.deepEqual(report[file], {
    operators: { distinct: 4, total: 4 }, operands: { distinct: 2, total: 3 },
    vocabulary: 6, length: 7, volume: 7 * Math.log2(6), difficulty: 3,
    effort: 3 * (7 * Math.log2(6)), time: 3 * (7 * Math.log2(6)) / 18,
  });
});

test("changed mode handles a rename from a nested directory without counting the source path", t => {
  const { cwd, git } = fixture(t);
  mkdirSync(join(cwd, "nested"));
  writeFileSync(join(cwd, "old.mjs"), "let value = 1;\n");
  git("add", "--", "old.mjs");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "original");
  git("mv", "--", "old.mjs", "nested/new name.mts");
  const result = spawnSync(process.execPath, [analyzer, "--git-changed", "--dir", "."],
    { cwd: join(cwd, "nested"), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^FILE: new name\.mts$/m);
  assert.doesNotMatch(result.stdout, /old\.mjs/);
});

test("empty scans succeed but bad refs, missing directories, and invalid source fail", t => {
  const { cwd, run } = fixture(t);
  const empty = run("--git-changed");
  assert.equal(empty.status, 0, empty.stderr);
  assert.match(empty.stdout, /No valid JavaScript or TypeScript files/);
  writeFileSync(join(cwd, "broken.ts"), "const =;\n");
  for (const result of [run("--git-diff-base", "unknown-ref"), run("--dir", "missing"), run("--files", "broken.ts")]) {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Halstead analysis failed|Failed to analyze broken\.ts/);
    assert.doesNotMatch(result.stdout, /No valid JavaScript or TypeScript files/);
  }
});
