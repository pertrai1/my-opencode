import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { captureSnapshot } from "../scripts/pr-agent-snapshot.mjs";
import { checkPrerequisites, reviewCandidates, runActions, viewReview } from "../scripts/pr-agent-runtime.mjs";

const patch = "diff --git a/app.js b/app.js\n--- a/app.js\n+++ b/app.js\n@@ -1,2 +1,2 @@\n context\n-old\n+new\n";
const review = { review: { key_issues_to_review: [{ relevant_file: "app.js", start_line: 2, end_line: 2, issue_header: "Bug", issue_content: "Fails on empty input." }] }, coverage: { files_not_reviewed: ["large.js"], files_partially_reviewed: [] } };
const success = stdout => ({ status: 0, stdout, stderr: "" });

function temporary(t) {
  const dir = mkdtempSync(join(tmpdir(), "pr-agent-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function repository(t) {
  const cwd = temporary(t);
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const write = (path, content) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  };
  git("init", "--quiet", "--initial-branch=main");
  write("app.js", "context\nold\n");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "baseline");
  return { cwd, git, write };
}

test("preflight distinguishes missing, incompatible and ready without installing or invoking a model", () => {
  for (const [result, status] of [
    [{ error: { code: "ENOENT" }, status: null }, "missing"],
    [success("--pr_url"), "incompatible"],
    [success("--diff-file --output --json-output"), "ready"],
    [{ status: 1, stderr: "private credentials" }, "failed"],
  ]) {
    const calls = [];
    const found = checkPrerequisites((...args) => { calls.push(args); return result; });
    assert.equal(found.status, status);
    assert.equal(calls.length, 1);
    for (const call of calls) assert.deepEqual(call.slice(0, 2), ["pr-agent", ["--help"]]);
    assert.doesNotMatch(JSON.stringify(found), /private credentials/);
  }
});

test("working snapshot includes staged, unstaged and untracked text without changing the index", t => {
  const repo = repository(t);
  repo.write("staged.js", "staged\n");
  repo.git("add", "staged.js");
  repo.write("app.js", "context\nnew\n");
  repo.write("new file.js", "untracked\n");
  repo.write(".env", "TOKEN=private\n");
  const before = repo.git("status", "--porcelain");
  const snapshot = captureSnapshot({}, { cwd: repo.cwd });
  for (const text of ["+staged", "+new", "+untracked"]) assert.ok(snapshot.patch.includes(text));
  assert.doesNotMatch(snapshot.patch, /TOKEN=private/);
  assert.ok(snapshot.excludedFiles.includes(".env"));
  assert.equal(repo.git("status", "--porcelain"), before);
  const staged = captureSnapshot({ scope: "staged" }, { cwd: repo.cwd });
  assert.match(staged.patch, /\+staged/);
  assert.doesNotMatch(staged.patch, /\+untracked|\+new\n/);
});

test("branch snapshot uses committed merge-base comparison, not a dirty worktree", t => {
  const repo = repository(t);
  repo.git("switch", "--quiet", "-c", "feature");
  repo.write("app.js", "committed\n");
  repo.git("add", ".");
  repo.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "change");
  repo.write("app.js", "dirty\n");
  const snapshot = captureSnapshot({ base: "main" }, { cwd: repo.cwd });
  assert.match(snapshot.patch, /\+committed/);
  assert.doesNotMatch(snapshot.patch, /dirty/);
  assert.equal(snapshot.mergeBase, repo.git("rev-parse", "main"));
  assert.equal(snapshot.head, repo.git("rev-parse", "HEAD"));
});

test("empty and conflicting scopes fail rather than reviewing an unrelated commit", t => {
  const repo = repository(t);
  assert.throws(() => captureSnapshot({}, { cwd: repo.cwd }), /empty/i);
  assert.throws(() => captureSnapshot({ base: "main", scope: "staged" }, { cwd: repo.cwd }), /scope/i);
});

test("nested working scope excludes known secrets, binary files and untracked symlinks", t => {
  const repo = repository(t);
  repo.write(".env", "OLD_PRIVATE=secret\n");
  repo.git("add", ".env");
  repo.write(".env", "NEW_PRIVATE=secret\n");
  repo.write("binary.dat", Buffer.from([0, 1, 2]));
  repo.write("src/normal.js", "normal\n");
  symlinkSync(join(repo.cwd, ".env"), join(repo.cwd, "link.js"));
  const snapshot = captureSnapshot({}, { cwd: join(repo.cwd, "src") });
  assert.match(snapshot.patch, /\+normal/);
  assert.doesNotMatch(snapshot.patch, /PRIVATE|binary.dat|link.js/);
  assert.ok(snapshot.excludedFiles.includes(".env"));
});

test("PR scope uses read-only gh calls and rejects a moving PR", t => {
  const cwd = temporary(t);
  const calls = [];
  const execute = (cmd, args) => {
    calls.push([cmd, args]);
    return success(args[1] === "diff" ? patch : JSON.stringify({ baseRefOid: "a".repeat(40), headRefOid: "b".repeat(40) }));
  };
  const snapshot = captureSnapshot({ pr: "https://github.com/owner/repo/pull/1" }, { cwd, execute });
  assert.equal(snapshot.head, "b".repeat(40));
  assert.equal(snapshot.patch, patch);
  assert.ok(calls.every(([cmd, args]) => cmd === "gh" && ["view", "diff"].includes(args[1])));
  let views = 0;
  assert.throws(() => captureSnapshot({ pr: "https://github.com/owner/repo/pull/1" }, { cwd, execute: (_cmd, args) => success(args[1] === "diff" ? patch : JSON.stringify({ baseRefOid: "a", headRefOid: String(views++) })) }), /changed/i);
});

test("review candidates retain coverage and unanchored findings, never invent anchors", () => {
  const payload = structuredClone(review);
  payload.review.key_issues_to_review.push({ ...review.review.key_issues_to_review[0], start_line: 999, end_line: 999 });
  const result = reviewCandidates(payload, patch);
  assert.equal(result.comments.length, 1);
  assert.deepEqual(result.comments[0].position, { side: "new", line: 2 });
  assert.equal(result.unanchored.length, 1);
  assert.deepEqual(result.coverage, review.coverage);
  assert.throws(() => reviewCandidates({}, patch), /review/i);
  assert.throws(() => reviewCandidates({ review: { key_issues_to_review: "none" } }, patch), /review/i);
});

test("review comments support deleted-side anchors and reject path traversal and credential-like bodies", () => {
  const deleted = patch.replace("+++ b/app.js", "+++ /dev/null").replace("@@ -1,2 +1,2 @@", "@@ -1,2 +0,0 @@").replace(" context", "-context").replace("+new\n", "");
  const result = reviewCandidates(review, deleted);
  assert.equal(result.comments[0].position.side, "old");
  const payload = structuredClone(review);
  payload.review.key_issues_to_review[0].relevant_file = "../app.js";
  assert.equal(reviewCandidates(payload, patch).comments.length, 0);
  payload.review.key_issues_to_review[0] = { ...review.review.key_issues_to_review[0], issue_content: `Leaked ghp_${"a".repeat(36)}` };
  assert.equal(reviewCandidates(payload, patch).comments.length, 0);
});

test("range anchors must be wholly inside captured hunks, with strict numeric coordinates", () => {
  for (const [start_line, end_line, count] of [[1, 2, 1], [1, 3, 0], ["2", "2", 0], [0, 0, 0], [2, 1, 0]]) {
    const payload = { review: { key_issues_to_review: [{ ...review.review.key_issues_to_review[0], start_line, end_line }] } };
    assert.equal(reviewCandidates(payload, patch).comments.length, count);
  }
  assert.deepEqual(reviewCandidates({ review: { key_issues_to_review: [] } }, patch).coverage, { status: "unknown" });
});

function fakeAgent(cmd, args, options) {
  assert.equal(cmd, "pr-agent");
  assert.equal(options.env.PUSH_OUTPUTS__ENABLE, "false");
  assert.equal(options.env.PR_AGENT_EXTRA_CONFIG_URL, "");
  assert.equal(options.env.CONFIG__PROPAGATE_TOOL_ERRORS, "true");
  assert.ok(!args.includes("--pr_url"));
  const output = args[args.indexOf("--output") + 1];
  writeFileSync(output, "# Local result\n");
  if (args.includes("--json-output")) writeFileSync(args[args.indexOf("--json-output") + 1], JSON.stringify(review));
  return success("sensitive runtime logs");
}

test("combined tools share one private diff and leave review candidates unapproved", t => {
  const tempRoot = temporary(t);
  const calls = [];
  const result = runActions({ patch, scope: "working", head: "abc", excludedFiles: [] }, { actions: ["review", "describe", "improve", "ask"], focus: "error handling", question: "What breaks?" }, {
    tempRoot, env: { PUSH_OUTPUTS__ENABLE: "true", PR_AGENT_EXTRA_CONFIG_URL: "https://untrusted.invalid" },
    execute: (...args) => { calls.push(args); return fakeAgent(...args); },
  });
  assert.equal(result.status, "completed");
  assert.equal(calls.length, 4);
  assert.equal(new Set(calls.map(([, args]) => args[1])).size, 1);
  assert.ok(calls.every(([, , options]) => options.cwd === result.directory));
  assert.equal(readFileSync(join(result.directory, "changes.diff"), "utf8"), patch);
  assert.deepEqual(JSON.parse(readFileSync(join(result.directory, "comments.json"), "utf8")), []);
  assert.equal(JSON.parse(readFileSync(join(result.directory, "candidates.json"), "utf8")).comments.length, 1);
  assert.ok(calls[3][1].includes("What breaks?"));
  assert.doesNotMatch(JSON.stringify(result), /sensitive runtime logs/);
});

test("failed processes, missing artifacts and malformed JSON cannot be reported as a clean review", t => {
  const tempRoot = temporary(t);
  for (const execute of [
    () => ({ status: 1, stderr: "private key" }),
    () => ({ status: null, error: { code: "ETIMEDOUT" } }),
    () => success(""),
    (cmd, args, opts) => { fakeAgent(cmd, args, opts); writeFileSync(args[args.indexOf("--json-output") + 1], "invalid"); return success(""); },
  ]) {
    const result = runActions({ patch }, { actions: ["review"] }, { execute, tempRoot });
    assert.equal(result.status, "failed");
    assert.doesNotMatch(JSON.stringify(result), /private key/);
  }
  assert.throws(() => runActions({ patch }, { actions: ["ask"] }, { tempRoot }), /question/i);
  assert.throws(() => runActions({ patch }, { actions: ["update_changelog"] }, { tempRoot }), /action/i);
});

test("a failed action stops subsequent model calls and preserves partial success", t => {
  const tempRoot = temporary(t);
  const result = runActions({ patch }, { actions: ["describe", "review", "improve"] }, {
    tempRoot, execute: (cmd, args, options) => args.includes("review") ? { status: 1 } : fakeAgent(cmd, args, options),
  });
  assert.deepEqual(result.actions.map(item => item.status), ["completed", "failed", "not_run"]);
});

test("real child-process boundary preserves hostile-looking focus as data and private artifact permissions", t => {
  const tempRoot = temporary(t);
  const executable = join(tempRoot, "pr-agent");
  writeFileSync(executable, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.writeFileSync(args[args.indexOf('--output') + 1], '# Result');
fs.writeFileSync(args[args.indexOf('--json-output') + 1], ${JSON.stringify(JSON.stringify(review))});
fs.writeFileSync('received.json', JSON.stringify({args, cwd:process.cwd(), sinks:process.env.PUSH_OUTPUTS__ENABLE}));
`);
  chmodSync(executable, 0o700);
  const marker = join(tempRoot, "must-not-exist");
  const focus = `'; touch ${marker}; $(echo unexpected)`;
  const result = runActions({ patch }, { actions: ["review"], focus }, { tempRoot, env: { ...process.env, PATH: `${tempRoot}:${process.env.PATH}` } });
  assert.equal(result.status, "completed");
  const received = JSON.parse(readFileSync(join(result.directory, "received.json"), "utf8"));
  assert.ok(received.args.includes(`--pr_reviewer.extra_instructions=${JSON.stringify(focus)}`));
  assert.equal(received.cwd, realpathSync(result.directory));
  assert.equal(received.sinks, "false");
  assert.equal(existsSync(marker), false);
  assert.equal(statSync(result.directory).mode & 0o777, 0o700);
  assert.equal(statSync(join(result.directory, "changes.diff")).mode & 0o777, 0o600);
});

test("Difit receives the saved patch and only explicitly approved, valid comments", t => {
  const tempRoot = temporary(t);
  const result = runActions({ patch }, { actions: ["review"] }, { execute: fakeAgent, tempRoot });
  const candidate = JSON.parse(readFileSync(join(result.directory, "candidates.json"), "utf8")).comments[0];
  writeFileSync(join(result.directory, "comments.json"), JSON.stringify([candidate]));
  let call;
  viewReview(result.directory, { execute: (...args) => { call = args; return success(""); } });
  assert.ok(call);
  assert.deepEqual(call.slice(0, 1), ["difit"]);
  assert.equal(call[2].input, patch);
  assert.deepEqual(JSON.parse(call[1][1]), candidate);
  writeFileSync(join(result.directory, "changes.diff"), patch + "tampered\n");
  assert.throws(() => viewReview(result.directory, { execute: () => assert.fail("must not launch") }), /snapshot/i);
});

test("viewer rejects invalid approved comments before launch and propagates viewer failure", t => {
  const tempRoot = temporary(t);
  const result = runActions({ patch }, { actions: ["review"] }, { execute: fakeAgent, tempRoot });
  writeFileSync(join(result.directory, "comments.json"), JSON.stringify([{ type: "thread", filePath: "../secret", body: "bad" }]));
  assert.throws(() => viewReview(result.directory, { execute: () => assert.fail("must not launch") }), /Invalid/);
  writeFileSync(join(result.directory, "comments.json"), "[]");
  assert.throws(() => viewReview(result.directory, { execute: () => ({ status: 1 }) }), /difit failed/);
  let command;
  viewReview(result.directory, { npx: true, execute: (cmd, args) => { command = [cmd, ...args]; return success(""); } });
  assert.deepEqual(command, ["npx", "difit"]);
});

test("CLI rejects unknown arguments and ask without a question before any model invocation", () => {
  for (const args of [["run", "ask"], ["run", "review", "--unexpected"]]) {
    const result = spawnSync(process.execPath, [new URL("../scripts/pr-agent.mjs", import.meta.url).pathname, ...args], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /question|Unknown option/i);
  }
});
