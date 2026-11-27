import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runProcess } from "../scripts/pr-agent-process.mjs";
import { captureSnapshot, patchFiles } from "../scripts/pr-agent-snapshot.mjs";

function repository(t) {
  const cwd = mkdtempSync(join(tmpdir(), "pr-agent-encoding-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commit = () => git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "--allow-empty", "-m", "fixture");
  git("init", "--quiet", "--initial-branch=main");
  commit();
  return { cwd, git, commit };
}

test("distinct invalid UTF-8 tracked names are rejected before they can share a comment path", t => {
  const { cwd, git, commit } = repository(t);
  // Git can store these paths even when the working filesystem cannot.
  const blob = git("hash-object", "-w", "--stdin");
  const entries = Buffer.from(`100644 ${blob}\tfile-\xfe.js\0` + `100644 ${blob}\tfile-\xff.js\0`, "latin1");
  execFileSync("git", ["update-index", "-z", "--index-info"], { cwd, input: entries });
  commit();
  assert.throws(() => captureSnapshot({}, { cwd }), /non-UTF-8/i);
  git("read-tree", "--empty");
  assert.throws(() => captureSnapshot({ scope: "staged" }, { cwd }), /non-UTF-8/i);
  commit();
  assert.throws(() => captureSnapshot({ base: "HEAD^" }, { cwd }), /non-UTF-8/i);
});

test("invalid UTF-8 untracked names fail before a lossy filesystem lookup", t => {
  const { cwd } = repository(t);
  const execute = (command, args, options) => {
    if (args.includes("ls-files")) {
      assert.equal(options.encoding, null);
      return { status: 0, stdout: Buffer.from("file-\xff.js\0", "latin1") };
    }
    return runProcess(command, args, options);
  };
  assert.throws(() => captureSnapshot({}, { cwd, execute }), /non-UTF-8/i);
});

test("valid Unicode, literal replacement characters and a leading filename BOM retain their identity", t => {
  const { cwd, git, commit } = repository(t);
  const names = ["café.js", "file-�.js", "\uFEFF.js"];
  for (const name of names) writeFileSync(join(cwd, name), "literal � and café\n");
  const verify = snapshot => {
    assert.deepEqual(patchFiles(snapshot.patch).map(file => file.newPath).sort(), [...names].sort());
    assert.match(snapshot.patch, /literal � and café/);
  };
  verify(captureSnapshot({}, { cwd }));
  git("add", ".");
  verify(captureSnapshot({ scope: "staged" }, { cwd }));
  commit();
  verify(captureSnapshot({ base: "HEAD^" }, { cwd }));
});

test("a BOM at the beginning of the untracked filename list is not stripped", t => {
  const { cwd } = repository(t);
  const name = "\uFEFFfirst.js";
  writeFileSync(join(cwd, name), "synthetic\n");
  assert.deepEqual(patchFiles(captureSnapshot({}, { cwd }).patch).map(file => file.newPath), [name]);
});

test("non-UTF-8 file content is rejected rather than silently replacing snapshot bytes", t => {
  const { cwd, git } = repository(t);
  writeFileSync(join(cwd, "app.js"), Buffer.from([0x61, 0xff, 0x0a]));
  assert.throws(() => captureSnapshot({}, { cwd }), /non-UTF-8/i);
  git("add", ".");
  assert.throws(() => captureSnapshot({ scope: "staged" }, { cwd }), /non-UTF-8/i);
});

test("hosted snapshots also require raw output and reject invalid filename bytes", () => {
  const patch = Buffer.concat([
    Buffer.from("diff --git a/app.js b/file-"), Buffer.from([0xff]),
    Buffer.from(".js\n--- a/app.js\n+++ b/file-"), Buffer.from([0xff]),
    Buffer.from(".js\n@@ -1 +1 @@\n-old\n+new\n"),
  ]);
  assert.throws(() => captureSnapshot({ pr: "https://github.com/owner/repo/pull/1" }, {
    execute: (_command, args, options) => {
      assert.equal(options.encoding, null, "request bytes before decoding at the subprocess boundary");
      return { status: 0, stdout: args[1] === "diff" ? patch : Buffer.from(JSON.stringify({ baseRefOid: "a".repeat(40), headRefOid: "b".repeat(40) })) };
    },
  }), /non-UTF-8/i);
});
