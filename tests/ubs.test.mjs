import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repository = fileURLToPath(new URL("../", import.meta.url));
const stages = [
  ["verify:toolchain", "Toolchain Check"],
  ["typecheck", "TypeScript Check"],
  ["lint", "ESLint"],
  ["lint:md", "Markdown Lint"],
  ["verify:workflow-actions", "Workflow Actions Check"],
  ["test", "Test Suite"],
];

async function runUbs(failCommand = "", exitCode = 0) {
  const root = await mkdtemp(join(tmpdir(), "ubs-test-"));
  const log = join(root, "npm.log");
  try {
    // Stub every npm invocation, including test, to avoid nested verification suites.
    await writeFile(join(root, "npm"), `#!/bin/sh
printf '%s\\n' "$*" >> "$UBS_TEST_LOG"
if [ "$2" = "$UBS_TEST_FAIL" ]; then
  exit "$UBS_TEST_EXIT"
fi
`, { mode: 0o755 });
    const result = spawnSync("bash", ["scripts/ubs.sh"], {
      cwd: repository,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${root}:${process.env.PATH}`,
        UBS_TEST_LOG: log,
        UBS_TEST_FAIL: failCommand,
        UBS_TEST_EXIT: String(exitCode),
      },
    });
    assert.ifError(result.error);
    return { ...result, calls: (await readFile(log, "utf8")).trim().split("\n") };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("UBS runs every check in order with toolchain first and reports success", async () => {
  const result = await runUbs();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(result.calls, stages.map(([command]) => `run ${command}`));
  assert.deepEqual(result.stdout.match(/^UBS_RESULT .*$/gm), [
    "UBS_RESULT status=success stage=Complete exit_code=0",
  ]);
  assert.equal(result.stderr, "");
});

for (const [index, [command, stage]] of stages.entries()) {
  test(`UBS preserves ${stage} failure status and skips later checks`, async () => {
    const exitCode = 31 + index;
    const result = await runUbs(command, exitCode);
    assert.equal(result.status, exitCode, result.stdout + result.stderr);
    assert.deepEqual(result.calls, stages.slice(0, index + 1).map(([name]) => `run ${name}`));
    assert.deepEqual(result.stderr.match(/^UBS_RESULT .*$/gm), [
      `UBS_RESULT status=failure stage=${stage} exit_code=${exitCode}`,
    ]);
    assert.ok(result.stderr.includes(`UBS FAILED on stage: ${stage}`));
    assert.doesNotMatch(result.stdout, /UBS_RESULT|All checks passed successfully/);
  });
}
