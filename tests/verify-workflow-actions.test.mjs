import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const verifier = join(process.cwd(), "scripts/verify-workflow-actions.mjs");
const sha = "a".repeat(40);

async function runVerifier(files) {
  const root = await mkdtemp(join(tmpdir(), "workflow-action-verifier-"));
  try {
    for (const [relativePath, contents] of Object.entries(files)) {
      const path = join(root, ".github/workflows", relativePath);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, contents);
    }
    return spawnSync(process.execPath, [verifier], { cwd: root, encoding: "utf8" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("accepts list-item external actions only with a full SHA and semantic release comment", async () => {
  const result = await runVerifier({ "ci.yml": `steps:\n  - uses: owner/action@${sha} # v1.2.3\n` });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /All third-party workflow actions/);
});

test("rejects malformed list-item external references with nested file and 1-based line diagnostics", async () => {
  const source = [
    "steps:",
    "  - uses: owner/action@abc # v1.2.3",
    "  - uses: owner/action@" + "g".repeat(40) + " # v1.2.3",
    "  - uses: owner/action@" + sha,
    "  - uses: owner/action@" + sha + " # v1.2",
  ].join("\n");
  const result = await runVerifier({ "nested/ci.yaml": source });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /\.github\/workflows\/nested\/ci\.yaml:2:\s+- uses: owner\/action@abc # v1\.2\.3/);
  assert.match(result.stderr, /\.github\/workflows\/nested\/ci\.yaml:3:/);
  assert.match(result.stderr, /\.github\/workflows\/nested\/ci\.yaml:4:/);
  assert.match(result.stderr, /\.github\/workflows\/nested\/ci\.yaml:5:/);
  assert.doesNotMatch(result.stderr, /TOKEN|SECRET|PRIVATE/);
});

test("ignores local actions, Docker actions, and ordinary non-uses lines", async () => {
  const source = [
    "steps:",
    "  - uses: ./actions/local",
    "  - uses: docker://alpine:3.20",
    "  - run: echo uses: owner/action@main",
    "  - name: ordinary step",
  ].join("\n");
  const result = await runVerifier({ "ci.yml": source });
  assert.equal(result.status, 0, result.stderr);
});

test("fails with a concise diagnostic when the workflow directory is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "workflow-action-verifier-"));
  try {
    const result = spawnSync(process.execPath, [verifier], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unable to read workflow directory/);
    assert.doesNotMatch(result.stderr, /node:internal|Error:/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
