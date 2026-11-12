import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repository = fileURLToPath(new URL("../", import.meta.url));
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && key !== "NODE_TEST_CONTEXT"));

test("npm test isolates fixtures from a hook's parent Git context", t => {
  const root = mkdtempSync(join(tmpdir(), "git-test-isolation-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const parent = join(root, "parent");
  const fixture = join(root, "fixture");
  mkdirSync(parent);
  mkdirSync(fixture);
  const git = (...args) => execFileSync("git", args, { cwd: parent, env: cleanEnv, encoding: "utf8" }).trim();
  git("init", "--quiet", "--initial-branch=main");
  writeFileSync(join(parent, "parent.txt"), "parent content\n");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "parent");
  writeFileSync(join(parent, "staged.txt"), "staged parent content\n");
  git("add", ".");
  const index = readFileSync(join(parent, ".git/index"));
  const refs = git("show-ref");
  const testFile = join(root, "fixture.test.mjs");
  writeFileSync(testFile, `import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const cwd = ${JSON.stringify(fixture)};
const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
git('init', '--quiet', '--initial-branch=fixture');
writeFileSync(cwd + '/fixture.txt', 'fixture content');
git('add', '.');
git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'fixture');
assert.equal(git('rev-parse', '--show-toplevel'), cwd);
assert.equal(process.env.TEST_PRESERVED_VALUE, 'preserved');
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX']) assert.equal(process.env[key], undefined);
console.log('FIXTURE_ISOLATED');
`);
  const result = spawnSync("npm", ["test", "--", testFile], {
    cwd: repository,
    encoding: "utf8",
    timeout: 30_000,
    env: {
      ...cleanEnv,
      GIT_DIR: join(parent, ".git"),
      GIT_WORK_TREE: parent,
      GIT_INDEX_FILE: join(parent, ".git/index"),
      GIT_COMMON_DIR: join(parent, ".git"),
      GIT_PREFIX: "nested/",
      TEST_PRESERVED_VALUE: "preserved",
    },
  });
  assert.equal(git("show-ref"), refs, "parent refs changed");
  assert.deepEqual(readFileSync(join(parent, ".git/index")), index, "parent index changed");
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /FIXTURE_ISOLATED/);
});
