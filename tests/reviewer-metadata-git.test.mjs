import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const router = new URL("../scripts/recommend-reviewers.mjs", import.meta.url).href;
const environment = { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };

function repository(t, paths) {
  const cwd = mkdtempSync(join(tmpdir(), "reviewer-metadata-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const write = (path, text) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), text);
  };
  git("init", "--quiet");
  for (const path of paths) write(path, "original\n");
  git("add", "--", ...paths);
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "fixture baseline");
  const metadata = () => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "--eval", `import { changeMetadata } from ${JSON.stringify(router)}; console.log(JSON.stringify(changeMetadata()));`], { cwd, env: environment, encoding: "utf8" }));
  return { git, write, metadata };
}

for (const [path, counter, extension] of [
  ["package.json", "dependencyFiles", "json"],
  ["scripts/example.mjs", "scriptFiles", "mjs"],
  [".github/workflows/ci.yml", "workflowFiles", "yml"],
]) {
  for (const [mode, status] of [["unstaged", " M"], ["staged", "M "], ["mixed", "MM"]]) {
    test(`real Git preserves the first ${mode} record for ${path}`, t => {
      const repo = repository(t, [path]);
      repo.write(path, "changed\n");
      if (mode !== "unstaged") repo.git("add", "--", path);
      if (mode === "mixed") repo.write(path, "changed again\n");
      const result = repo.metadata();
      assert.equal(result.files, `${status} ${path}`);
      assert.equal(result.summary.fileCount, 1);
      assert.equal(result.summary[counter], 1);
      assert.deepEqual(result.summary.extensions, { [extension]: 1 });
    });
  }
}

test("real Git preserves multiple records, untracked paths and quoted path spelling", t => {
  const repo = repository(t, ["package.json", "scripts/example.mjs", "notes with spaces.md"]);
  for (const path of ["package.json", "scripts/example.mjs", "notes with spaces.md"]) repo.write(path, "changed\n");
  repo.write("commands/new.md", "new\n");
  const raw = repo.git("status", "--porcelain=v1", "--untracked-files=all");
  const result = repo.metadata();
  assert.equal(`${result.files}\n`, raw);
  assert.equal(result.summary.fileCount, 4);
  assert.equal(result.summary.newFileCount, 1);
  assert.equal(result.summary.dependencyFiles, 1);
  assert.equal(result.summary.scriptFiles, 1);
  assert.equal(result.summary.workflowFiles, 1);
});

test("real Git clean and newly added files retain their metadata states", t => {
  const repo = repository(t, ["README.md"]);
  const clean = repo.metadata();
  assert.equal(clean.files, "");
  assert.equal(clean.stat, "");
  assert.equal(clean.summary.fileCount, 0);
  repo.write("scripts/new.mjs", "new\n");
  repo.git("add", "--", "scripts/new.mjs");
  const added = repo.metadata();
  assert.equal(added.files, "A  scripts/new.mjs");
  assert.equal(added.summary.newFileCount, 1);
  assert.equal(added.summary.scriptFiles, 1);
});
