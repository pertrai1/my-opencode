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
const { spawn } = require("node:child_process");
const [, method, path, , data] = process.argv.slice(2);
const body = data ? JSON.parse(data) : undefined;
const mode = process.env.ANGULAR_EVAL_TEST_MODE;
const stage = path.endsWith("/interrupt") ? "interrupt"
  : path.endsWith("/prompt") ? "prompt"
  : path.endsWith("/wait") ? "wait"
  : method === "get" ? "trace" : "create";
const hanging = mode?.includes("hang-" + stage);
if (hanging) process.on("SIGTERM", () => {});
// Publishing the PID also signals that the stubborn child is ready.
appendFileSync(process.env.ANGULAR_EVAL_TEST_LOG, JSON.stringify({ method, path, body, pid: process.pid }) + "\\n");
if (hanging) {
  setInterval(() => {}, 1000);
} else if (mode?.includes("fail-" + stage)) {
  console.error("synthetic " + stage + " failure");
  process.exit(7);
} else if (mode?.includes("malformed-" + stage)) {
  console.log("not-json");
} else {
let response = {};
if (stage === "interrupt") response = { interrupted: !mode?.includes("idle") };
if (path === "/api/session") response = { data: { id: mode === "missing-id" ? undefined : "fixture-session" } };
if (mode?.includes("missing-boolean") && stage === "interrupt") response = {};
if (method === "get") response = { data: [
  { type: "user", text: ${JSON.stringify(prompt)} },
  { type: "assistant", content: [
    { type: "tool", name: "skill", state: { input: { id: "angular" }, status: "completed" } }
  ] },
  { type: "idle", outcome: mode === "failed-turn" ? "failed" : "succeeded" }
] };
if (mode === "late-trace" && stage === "trace") {
  // Keep output open until the caller observes this CLI's exit and aborts.
  spawn(process.execPath, ["-e", \`
    const { existsSync } = require("node:fs");
    const timeout = setTimeout(() => process.exit(2), 5000);
    const poll = setInterval(() => {
      if (existsSync(process.env.ANGULAR_EVAL_TEST_LOG + ".release")) {
        clearInterval(poll);
        clearTimeout(timeout);
      }
    }, 5);
  \`], { stdio: ["ignore", process.stdout, process.stderr] }).unref();
}
console.log(JSON.stringify(response));
}
`, { mode: 0o755 });

  return {
    directory, angular, plainJs,
    call(selected = "angular", roots = {}, lifecycle = {}) {
      const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
        import LiveProvider from ${JSON.stringify(lifecycle.nodeTrace
          ? new URL("../evals/nodejs-skill/trace-provider.mjs", import.meta.url).href : providerUrl)};
        import { readFileSync, writeFileSync } from "node:fs";
        const lifecycle = ${JSON.stringify(lifecycle)};
        const controller = new AbortController();
        if (lifecycle.abort === "before") controller.abort(new Error("synthetic cancellation"));
        const poll = setInterval(() => {
          const log = readFileSync(process.env.ANGULAR_EVAL_TEST_LOG, "utf8");
          if (lifecycle.abort && log.includes(lifecycle.abort)) {
            controller.abort(new Error("synthetic cancellation"));
          }
          if (lifecycle.mode === "late-trace" && !controller.signal.aborted) {
            const trace = log.split("\\n").filter(Boolean).map(JSON.parse)
              .find(call => call.method === "get");
            if (!trace) return;
            try {
              process.kill(trace.pid, 0);
            } catch (error) {
              if (error.code !== "ESRCH") throw error;
              controller.abort(new Error("cancellation after trace exit"));
              writeFileSync(process.env.ANGULAR_EVAL_TEST_LOG + ".release", "");
            }
          }
        }, 5);
        const result = await new LiveProvider(lifecycle.options).callApi(${JSON.stringify(prompt)}, {
          vars: { fixture: ${JSON.stringify(selected)} }
        }, { abortSignal: controller.signal });
        clearInterval(poll);
        console.log(JSON.stringify(result));
      `], {
        cwd: directory,
        encoding: "utf8",
        timeout: 10_000,
        env: {
          PATH: [bin, dirname(process.execPath), process.env.PATH].join(delimiter),
          ANGULAR_EVAL_TEST_LOG: log,
          ANGULAR_EVAL_TEST_MODE: lifecycle.mode,
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

for (const stage of ["prompt", "wait", "trace"]) {
  test(`cancellation during ${stage} interrupts only the created session`, (t) => {
    const setup = fixture(t);
    const suffix = stage === "trace" ? "/message?" : `/${stage}`;
    const { response, calls } = setup.call("angular", {
      ANGULAR_SKILL_ANGULAR_ROOT: setup.angular,
    }, { mode: `hang-${stage}`, abort: suffix });
    assert.match(response.error, /aborted/);
    assert.equal(response.metadata.sessionId, "fixture-session");
    assert.deepEqual(response.metadata.cleanup, { status: "interrupted" });
    assert.equal(calls.at(-1).path, "/api/session/fixture-session/interrupt");
    assert.equal(calls.filter(call => call.path.endsWith("/interrupt")).length, 1);
    assert.equal(response.output, undefined);
    const cancelled = calls.find(call => call.path.includes(suffix));
    assert.throws(() => process.kill(cancelled.pid, 0), { code: "ESRCH" },
      "the ready SIGTERM-resistant CLI must have exited after cancellation");
  });
}

test("cancellation after trace CLI exit still fails and interrupts the session", (t) => {
  const setup = fixture(t);
  const { response, calls } = setup.call("angular", {
    ANGULAR_SKILL_ANGULAR_ROOT: setup.angular,
  }, { mode: "late-trace" });
  assert.equal(response.error, "cancellation after trace exit");
  assert.equal(response.output, undefined);
  assert.equal(response.metadata.sessionId, "fixture-session");
  assert.deepEqual(response.metadata.cleanup, { status: "interrupted" });
  assert.equal(calls.filter(call => call.path.endsWith("/interrupt")).length, 1);
  assert.equal(calls.at(-1).path, "/api/session/fixture-session/interrupt");
});

test("already cancelled requests make no CLI calls", (t) => {
  const setup = fixture(t);
  const result = setup.call("angular", {}, { abort: "before" });
  assertSetupError(result, /synthetic cancellation/);
  assert.equal(result.response.metadata.cleanup.status, "not-attempted");
});

for (const mode of ["fail-create", "malformed-create", "hang-create", "missing-id"]) {
  test(`${mode} cannot interrupt an unknown session`, (t) => {
    const setup = fixture(t);
    const { response, calls } = setup.call("angular", {
      ANGULAR_SKILL_ANGULAR_ROOT: setup.angular,
    }, { mode, options: { timeoutMs: 1000 } });
    assert.ok(response.error);
    assert.equal(response.metadata.cleanup.status, "not-attempted");
    assert.deepEqual(calls.map(call => call.path), ["/api/session"]);
  });
}

for (const [mode, status] of [
  ["hang-wait", "interrupted"],
  ["fail-prompt", "interrupted"],
  ["fail-wait idle", "idle"],
  ["malformed-trace", "interrupted"],
  ["failed-turn", "interrupted"],
  ["fail-wait missing-boolean", "unconfirmed"],
  ["fail-wait fail-interrupt", "unconfirmed"],
  ["fail-wait malformed-interrupt", "unconfirmed"],
  ["fail-wait hang-interrupt", "unconfirmed"],
]) {
  test(`${mode} preserves the failure and reports ${status} cleanup`, (t) => {
    const setup = fixture(t);
    const started = Date.now();
    const { response, calls } = setup.call("angular", {
      ANGULAR_SKILL_ANGULAR_ROOT: setup.angular,
    }, { mode, options: { timeoutMs: 1000, interruptTimeoutMs: 1000 } });
    assert.ok(response.error);
    if (mode.startsWith("fail-wait")) assert.match(response.error, /synthetic wait failure/);
    assert.equal(response.output, undefined);
    assert.equal(response.metadata.sessionId, "fixture-session");
    assert.equal(response.metadata.cleanup.status, status);
    if (status === "unconfirmed") assert.ok(response.metadata.cleanup.error);
    assert.equal(calls.at(-1).path, "/api/session/fixture-session/interrupt");
    assert.equal(calls.at(-1).method, "post");
    assert.ok(Date.now() - started < 8000, "hung CLI calls must be bounded");
    assert.ok(calls.every(call => call.method !== "delete"));
  });
}

test("Node trace provider inherits request cancellation and session cleanup", (t) => {
  const setup = fixture(t);
  const { response, calls } = setup.call("node", {
    NODEJS_SKILL_NODE_ROOT: setup.plainJs,
  }, { mode: "hang-wait", abort: "/wait", nodeTrace: true });
  assert.match(response.error, /aborted/);
  assert.deepEqual(response.metadata.cleanup, { status: "interrupted" });
  assert.equal(calls.find(call => call.path === "/api/session").body.title, "Node.js skill eval");
  assert.equal(calls.at(-1).path, "/api/session/fixture-session/interrupt");
});

test("cancellation during creation reports unknown session without further calls", (t) => {
  const setup = fixture(t);
  const { response, calls } = setup.call("angular", {
    ANGULAR_SKILL_ANGULAR_ROOT: setup.angular,
  }, { mode: "hang-create", abort: "/api/session" });
  assert.match(response.error, /aborted/);
  assert.equal(response.metadata.cleanup.status, "not-attempted");
  assert.equal(response.metadata.sessionId, undefined);
  assert.deepEqual(calls.map(call => call.path), ["/api/session"]);
});
