import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runActions } from "../scripts/pr-agent-runtime.mjs";

const patch = "diff --git a/app.js b/app.js\n--- a/app.js\n+++ b/app.js\n@@ -1 +1 @@\n-old\n+new\n";

function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), "pr-agent-isolation-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function fakeAgent(_command, args) {
  writeFileSync(args[args.indexOf("--output") + 1], "Synthetic result");
  if (args.includes("--json-output")) writeFileSync(args[args.indexOf("--json-output") + 1], JSON.stringify({ review: { key_issues_to_review: [] } }));
  return { status: 0, stdout: "", stderr: "" };
}

test("every action strips inherited artifact ingestion settings without changing model credentials", t => {
  const env = {
    ARTIFACT_PATH: "/synthetic/private.txt", PR_AGENT_ARTIFACT_PATH: "/synthetic/fallback.txt",
    ARTIFACT_INSTRUCTIONS: "include private data", PR_AGENT_ARTIFACT_INSTRUCTIONS: "include fallback",
    ARTIFACTS: '{enable=true,artifact_path="/synthetic/section.txt"}',
    artifacts: '@json {"enable":true}', "Artifacts.Enable": "true",
    ARTIFACTS__ARTIFACT_PATH: "/synthetic/nested.txt", artifacts__enable: "true",
    DyNaCoNf_ARTIFACTS: "{enable=true}", DYNACONF_ARTIFACTS__ENABLE: "true",
    OPENAI_API_KEY: "synthetic-key", CONFIG__MODEL: "synthetic-model",
  };
  const before = { ...env };
  const seen = [];
  const result = runActions({ patch }, { actions: ["review", "describe", "improve", "ask"], question: "What changed?" }, {
    env, tempRoot: temporary(t), execute: (command, args, options) => {
      seen.push(options.env);
      return fakeAgent(command, args);
    },
  });
  assert.equal(result.status, "completed");
  assert.equal(seen.length, 4);
  for (const child of seen) {
    const entries = Object.entries(child).filter(([key]) => /^(?:DYNACONF_)?(?:ARTIFACTS(?:$|__|\.)|(?:PR_AGENT_)?ARTIFACT_(?:PATH|INSTRUCTIONS)$)/i.test(key));
    assert.deepEqual(entries, [["ARTIFACTS__ENABLE", "false"], ["ARTIFACTS.ENABLE", "false"]]);
    assert.equal(child.OPENAI_API_KEY, env.OPENAI_API_KEY);
    assert.equal(child.CONFIG__MODEL, env.CONFIG__MODEL);
  }
  assert.deepEqual(env, before);
});

test("callback guards follow whole-section settings and replace every inherited leaf alias", t => {
  const guarded = ["success_callback", "failure_callback", "service_callback", "enable_callbacks", "turn_off_message_logging"];
  const sections = { LITELLM: '{success_callback=["langsmith"],custom_llm_provider="synthetic"}', litellm: '@json {"failure_callback":["langsmith"],"drop_params":true}' };
  const aliases = {};
  for (const prefix of ["", "DYNACONF_", "DyNaCoNf_"]) {
    for (const separator of [".", "__"]) {
      for (const setting of guarded) {
        aliases[`${prefix}LITELLM${separator}${setting.toUpperCase()}`] = '["synthetic-callback"]';
        aliases[`${prefix}litellm${separator}${setting}`] = "true";
      }
    }
  }
  for (const env of [{ ...sections, ...aliases }, { ...aliases, ...sections }]) {
    const before = { ...env };
    let calls = 0;
    const result = runActions({ patch }, { actions: ["review", "describe", "improve", "ask"], question: "What changed?" }, {
      env, tempRoot: temporary(t), execute: (command, args, { env: child }) => {
        calls++;
        const entries = Object.entries(child);
        const leaves = entries.filter(([key]) => /^(?:DYNACONF_)?LITELLM(?:__|\.)/i.test(key));
        assert.deepEqual(leaves, guarded.map(key => [`LITELLM__${key.toUpperCase()}`, key === "turn_off_message_logging" ? "true" : "false"]));
        for (const [key, value] of Object.entries(sections)) {
          assert.equal(child[key], value, "preserve whole-section provider settings");
          assert.ok(entries.findIndex(([name]) => name === key) < entries.findIndex(([name]) => name === "LITELLM__SUCCESS_CALLBACK"));
        }
        return fakeAgent(command, args);
      },
    });
    assert.equal(result.status, "completed");
    assert.equal(calls, 4);
    assert.deepEqual(env, before);
  }
});

test("temporary roots inside any Git ancestor fail before writing a patch or launching a tool", t => {
  for (const marker of ["directory", "worktree-file"]) {
    const repository = temporary(t);
    if (marker === "directory") mkdirSync(join(repository, ".git"));
    else writeFileSync(join(repository, ".git"), "gitdir: /synthetic/main/.git/worktrees/review\n");
    const nested = join(repository, "nested", "temp");
    mkdirSync(nested, { recursive: true });
    for (const tempRoot of [repository, nested]) {
      const before = readdirSync(tempRoot);
      assert.throws(() => runActions({ patch }, { actions: ["describe"] }, {
        tempRoot, execute: () => assert.fail("must reject Git ancestry before launch"),
      }), /temporary.*outside.*Git/i);
      assert.deepEqual(readdirSync(tempRoot), before, "rejection must not leave a saved patch or run directory");
    }
  }
});

test("temporary-root symlinks are checked by their canonical location", t => {
  const root = temporary(t);
  const repository = join(root, "repository");
  const safe = join(root, "safe");
  mkdirSync(repository);
  mkdirSync(join(repository, ".git"));
  mkdirSync(safe);
  const unsafeAlias = join(root, "unsafe-alias");
  symlinkSync(repository, unsafeAlias, "dir");
  assert.throws(() => runActions({ patch }, { actions: ["describe"] }, {
    tempRoot: unsafeAlias, execute: () => assert.fail("must not launch in a symlinked checkout"),
  }), /temporary.*outside.*Git/i);
  const safeAlias = join(repository, "safe-alias");
  symlinkSync(safe, safeAlias, "dir");
  const result = runActions({ patch }, { actions: ["describe"] }, { tempRoot: safeAlias, execute: fakeAgent });
  assert.equal(result.status, "completed");
  assert.ok(result.directory.startsWith(`${realpathSync(safe)}/`));
  assert.equal(readFileSync(join(result.directory, "changes.diff"), "utf8"), patch);
});

test("the default TMPDIR cannot place the plain-diff subprocess inside a repository", t => {
  const repository = temporary(t);
  mkdirSync(join(repository, ".git"));
  const script = `import { runActions } from ${JSON.stringify(new URL("../scripts/pr-agent-runtime.mjs", import.meta.url).href)};
runActions({patch:"synthetic"}, {actions:["describe"]}, {execute:()=>{throw new Error("UNSAFE_LAUNCH")}});`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    env: { ...process.env, TMPDIR: repository, TMP: repository, TEMP: repository }, encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /temporary.*outside.*Git/i);
  assert.doesNotMatch(result.stderr, /UNSAFE_LAUNCH/);
  assert.deepEqual(readdirSync(repository), [".git"]);
});
