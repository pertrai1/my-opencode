import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { captureSnapshot } from "../scripts/pr-agent-snapshot.mjs";
import { checkPrerequisites, runActions } from "../scripts/pr-agent-runtime.mjs";

const patch = "diff --git a/app.js b/app.js\n--- a/app.js\n+++ b/app.js\n@@ -1 +1 @@\n-old\n+new\n";
const success = stdout => ({ status: 0, stdout, stderr: "" });

function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), "pr-agent-boundary-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function hostedSnapshot(diff) {
  return captureSnapshot({ pr: "https://github.com/owner/repo/pull/1" }, {
    execute: (_command, args) => success(args[1] === "diff" ? diff : JSON.stringify({ baseRefOid: "a".repeat(40), headRefOid: "b".repeat(40) })),
  });
}

test("explicitly empty scope selectors fail before collecting any snapshot", () => {
  for (const selector of ["base", "pr", "scope"]) {
    assert.throws(() => captureSnapshot({ [selector]: "" }, {
      execute: () => assert.fail("must reject the empty selector before invoking a tool"),
    }), /scope.*empty|empty.*scope/i);
  }
});

test("hosted snapshots exclude a chunk when either real path is unsupported", () => {
  for (const header of ["---", "+++"]) {
    for (const path of ['"a/credentials\\t.pem"', '"a/credentials\\377.pem"', "a/../credentials.pem"]) {
      const unsafe = patch.replace(`${header} ${header === "---" ? "a" : "b"}/app.js`, `${header} ${path}`).replace("+new", "+SYNTHETIC_CREDENTIAL");
      const snapshot = hostedSnapshot(unsafe + patch);
      assert.equal(snapshot.patch, patch);
      assert.ok(snapshot.excludedFiles.length > 0);
    }
  }
});

test("hosted snapshots retain valid additions, deletions and renames", () => {
  const addition = patch.replace("--- a/app.js", "--- /dev/null");
  const deletion = patch.replace("+++ b/app.js", "+++ /dev/null");
  const rename = patch.replaceAll("b/app.js", "b/renamed.js");
  for (const valid of [addition, deletion, rename]) assert.equal(hostedSnapshot(valid).patch, valid);
});

test("working snapshot stops collecting untracked patches when the byte limit is exceeded", t => {
  const cwd = temporary(t);
  const files = ["one.js", "two.js", "three.js"];
  for (const file of files) writeFileSync(join(cwd, file), "fixture\n");
  const largePatch = patch + "x".repeat(9 * 1024 * 1024);
  let untrackedDiffs = 0;
  const execute = (_command, args) => {
    if (args.includes("--show-toplevel")) return success(cwd);
    if (args.includes("rev-parse")) return success("a".repeat(40));
    if (args.includes("ls-files")) return success(files.join("\0") + "\0");
    if (args.includes("--no-index")) untrackedDiffs++;
    return success(largePatch);
  };
  assert.throws(() => captureSnapshot({}, { cwd, execute }), /16 MiB/);
  assert.equal(untrackedDiffs, 1, "must not collect remaining files or repeat the snapshot after exceeding the limit");
});

test("working and staged snapshots support unborn HEAD without changing the index", t => {
  const cwd = temporary(t);
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--quiet", "--initial-branch=main");
  writeFileSync(join(cwd, "app.js"), "staged\n");
  git("add", "app.js");
  writeFileSync(join(cwd, "app.js"), "working\n");
  writeFileSync(join(cwd, "new.js"), "untracked\n");
  const before = git("status", "--porcelain");
  const working = captureSnapshot({}, { cwd });
  assert.equal(working.head, null);
  assert.match(working.patch, /\+working/);
  assert.match(working.patch, /\+untracked/);
  const staged = captureSnapshot({ scope: "staged" }, { cwd });
  assert.equal(staged.head, null);
  assert.match(staged.patch, /\+staged/);
  assert.doesNotMatch(staged.patch, /working|untracked/);
  assert.equal(git("status", "--porcelain"), before);
  assert.throws(() => captureSnapshot({ base: "main" }, { cwd }), /failed|commit|HEAD/i);
});

test("an unborn HEAD becoming committed during collection invalidates the snapshot", t => {
  const cwd = temporary(t);
  let headReads = 0;
  const execute = (_command, args) => {
    if (args.includes("--show-toplevel")) return success(cwd);
    if (args.includes("HEAD^{commit}")) return ++headReads === 1 ? { status: 1, stdout: "" } : success("a".repeat(40));
    if (args.includes("symbolic-ref")) return success("refs/heads/main");
    if (args.includes("refs/heads/main")) return { status: 1, stdout: "" };
    if (args.includes("hash-object")) return success("e".repeat(40));
    return success(args.includes("diff") ? patch : "");
  };
  assert.throws(() => captureSnapshot({}, { cwd, execute }), /changed during capture/);
});

test("inherited output sink sections and case variants cannot override local-only settings", t => {
  const env = {
    PUSH_OUTPUTS__ENABLE: "true", "PUSH_OUTPUTS.ENABLE": "true",
    PUSH_OUTPUTS: '{enable=true,channels=["webhook"]}',
    push_outputs: '@json {"enable":true}', "push_outputs.enable": "true",
    push_outputs__enable: "true", DyNaCoNf_PUSH_OUTPUTS: "{enable=true}",
    DYNACONF_PUSH_OUTPUTS__ENABLE: "true", MODEL: "synthetic-model",
  };
  const before = { ...env };
  let childEnv;
  const result = runActions({ patch }, { actions: ["describe"] }, {
    env, tempRoot: temporary(t), execute: (_command, args, options) => {
      childEnv = options.env;
      writeFileSync(args[args.indexOf("--output") + 1], "Synthetic description");
      return success("");
    },
  });
  assert.equal(result.status, "completed");
  const sinkEntries = Object.entries(childEnv).filter(([key]) => /^(?:DYNACONF_)?PUSH_OUTPUTS(?:$|__|\.)/i.test(key));
  assert.deepEqual(sinkEntries, [["PUSH_OUTPUTS__ENABLE", "false"], ["PUSH_OUTPUTS.ENABLE", "false"]]);
  assert.equal(childEnv.MODEL, env.MODEL);
  assert.deepEqual(env, before);
});

test("ask questions round-trip through the PR-Agent encoded-text contract without becoming settings", t => {
  // PR-Agent v0.50.0 algo/utils.py: update_settings_from_args handles -- options
  // before decode_user_text_args decodes this prefix. Exercise that boundary,
  // not merely shell escaping or raw argv equality.
  const prefix = "__pr_agent_encoded_text__:";
  for (const question of ["--help", "--push_outputs.enable=true", "--config.publish_output=false", "key=value", '  quoted "text" \\ path\nUnicode: café 🦊  ', `${prefix}literal%20text`]) {
    let decoded;
    const result = runActions({ patch }, { actions: ["ask"], question }, {
      tempRoot: temporary(t), execute: (_command, args) => {
        const text = args[args.indexOf("ask") + 1];
        assert.equal(text.startsWith("--"), false, "question must not enter PR-Agent's settings parser");
        assert.ok(text.startsWith(prefix), "use the upstream text decoder rather than JSON quoting");
        decoded = decodeURIComponent(text.slice(prefix.length));
        writeFileSync(args[args.indexOf("--output") + 1], "Synthetic answer");
        return success("");
      },
    });
    assert.equal(result.status, "completed");
    assert.equal(decoded, question);
  }
});

test("ask preflight rejects versions without the literal-question protocol", () => {
  for (const [version, status] of [["pr-agent 0.44.0", "incompatible"], ["pr-agent 0.45.0", "ready"], ["pr-agent 0.50.0", "ready"], ["pr-agent 1.0.0", "ready"], ["unknown", "incompatible"]]) {
    const execute = (_command, args) => success(args.includes("--help") ? "--diff-file --output --json-output" : version);
    assert.equal(checkPrerequisites(execute, { actions: ["ask"] }).status, status);
    assert.equal(checkPrerequisites(execute, { actions: ["review"] }).status, "ready");
  }
});
