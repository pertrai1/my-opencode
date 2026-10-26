import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import test from "node:test";

const prompt = "Explain the root component. Do not modify files.";
const providerUrl = new URL("../evals/angular-skill/live-provider.mjs", import.meta.url).href;

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "angular-live-provider-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bin = join(directory, "bin");
  const angular = join(directory, "Angular fixture with spaces");
  const plainJs = join(directory, "plain-js");
  for (const path of [bin, angular, plainJs]) mkdirSync(path);
  const log = join(directory, "calls.jsonl");
  writeFileSync(log, "");
  writeFileSync(join(bin, "opencode"), `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const [, method, path, , data] = process.argv.slice(2);
const body = data ? JSON.parse(data) : undefined;
appendFileSync(process.env.ANGULAR_EVAL_TEST_LOG, JSON.stringify({ method, path, body }) + "\\n");
let response = {};
if (path === "/api/session") response = { data: { id: "fixture-session" } };
if (method === "get") response = { data: [
  { type: "user", text: ${JSON.stringify(prompt)} },
  { type: "assistant", content: [
    { type: "tool", name: "skill", state: { input: { id: "angular" }, status: "completed" } }
  ] },
  { type: "idle", outcome: "succeeded" }
] };
console.log(JSON.stringify(response));
`, { mode: 0o755 });

  return {
    directory, angular, plainJs,
    call(selected = "angular", roots = {}) {
      const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
        import LiveProvider from ${JSON.stringify(providerUrl)};
        const result = await new LiveProvider().callApi(${JSON.stringify(prompt)}, {
          vars: { fixture: ${JSON.stringify(selected)} }
        });
        console.log(JSON.stringify(result));
      `], {
        cwd: directory,
        encoding: "utf8",
        timeout: 10_000,
        env: {
          PATH: [bin, dirname(process.execPath), process.env.PATH].join(delimiter),
          ANGULAR_EVAL_TEST_LOG: log,
          ...roots,
        },
      });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return {
        response: JSON.parse(result.stdout),
        calls: readFileSync(log, "utf8").split("\n").filter(Boolean).map(JSON.parse),
      };
    },
  };
}

test("live provider uses the configured Angular fixture directory", (t) => {
  const setup = fixture(t);
  const { response, calls } = setup.call("angular", {
    ANGULAR_SKILL_ANGULAR_ROOT: setup.angular,
  });
  const created = calls.find(call => call.path === "/api/session");
  assert.equal(response.error, undefined);
  assert.equal(created.body.root, setup.angular);
  assert.equal(created.body.agent, "lean");
  assert.deepEqual(created.body.model, {
    providerID: "openai", id: "gpt-6-astra", variant: "high",
  });
  assert.deepEqual(calls.map(call => [call.method, call.path]), [
    ["post", "/api/session"],
    ["post", "/api/session/fixture-session/prompt"],
    ["post", "/api/experimental/session/fixture-session/wait"],
    ["get", "/api/session/fixture-session/message?order=asc&limit=100"],
  ]);
  assert.deepEqual(JSON.parse(response.output), {
    toolCalls: [{ name: "skill", arguments: { id: "angular" }, status: "completed" }],
  });
  assert.equal(response.metadata.sessionId, "fixture-session");
});

test("plainJs uses its own root without requiring an Angular root", (t) => {
  const setup = fixture(t);
  const { response, calls } = setup.call("plainJs", {
    ANGULAR_SKILL_PLAIN_JS_ROOT: setup.plainJs,
  });
  assert.equal(response.error, undefined);
  assert.equal(calls.find(call => call.path === "/api/session").body.root, setup.plainJs);
});

test("relative roots resolve from the eval process working directory", (t) => {
  const setup = fixture(t);
  const { response, calls } = setup.call("angular", {
    ANGULAR_SKILL_ANGULAR_ROOT: "Angular fixture with spaces",
  });
  assert.equal(response.error, undefined);
  // The child process working directory resolves symlinks such as macOS /var.
  assert.equal(calls.find(call => call.path === "/api/session").body.root, realpathSync(setup.angular));
});

function assertSetupError(result, expected) {
  assert.match(result.response.error, expected);
  assert.equal(result.response.output, undefined);
  assert.equal(result.response.metadata.sessionId, undefined);
  assert.deepEqual(result.calls, [], "setup errors must not invoke OpenCode");
}

for (const [selected, variable] of [
  ["angular", "ANGULAR_SKILL_ANGULAR_ROOT"],
  ["plainJs", "ANGULAR_SKILL_PLAIN_JS_ROOT"],
]) {
  for (const value of [undefined, "", " \t "]) {
    test(`${selected} requires a nonblank root (${JSON.stringify(value)})`, (t) => {
      const setup = fixture(t);
      const roots = value === undefined ? {} : { [variable]: value };
      assertSetupError(setup.call(selected, roots), new RegExp(`Set ${variable}`));
    });
  }
}

test("missing fixture directory fails before session creation", (t) => {
  const setup = fixture(t);
  assertSetupError(setup.call("angular", {
    ANGULAR_SKILL_ANGULAR_ROOT: join(setup.directory, "missing"),
  }), /ANGULAR_SKILL_ANGULAR_ROOT must point to an existing directory:/);
});

test("a regular file cannot be used as a fixture directory", (t) => {
  const setup = fixture(t);
  const file = join(setup.directory, "file.txt");
  writeFileSync(file, "fixture");
  assertSetupError(setup.call("plainJs", {
    ANGULAR_SKILL_PLAIN_JS_ROOT: file,
  }), /ANGULAR_SKILL_PLAIN_JS_ROOT must point to an existing directory:/);
});

for (const selected of ["unknown", "toString", "__proto__"]) {
  test(`unknown fixture ${selected} fails before session creation`, (t) => {
    const setup = fixture(t);
    assertSetupError(setup.call(selected, {
      ANGULAR_SKILL_ANGULAR_ROOT: setup.angular,
    }), new RegExp(`Unknown eval fixture: ${selected}`));
  });
}
