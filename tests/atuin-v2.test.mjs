import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";

import plugin from "../plugins/atuin.ts";

async function setup(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "atuin-test-")));
  const log = path.join(directory, "calls.jsonl");
  fs.writeFileSync(path.join(directory, "atuin"), `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, cwd: process.cwd() }) + "\\n");
if (args[1] === "start") process.stdout.write("history-test-id\\n");
`, { mode: 0o700 });
  const previousPath = process.env.PATH;
  process.env.PATH = `${directory}:${previousPath}`;
  const events = new PassThrough({ objectMode: true });
  t.after(() => {
    process.env.PATH = previousPath;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const hooks = {};
  const dispose = await plugin.setup({
    location: { directory },
    tool: { hook: async (name, handler) => { hooks[name] = handler; } },
    event: {
      async *subscribe() {
        for await (const { event, done } of events) {
          yield event;
          done();
        }
      },
    },
  });
  t.after(() => {
    events.end();
    dispose?.();
  });
  return {
    hooks,
    calls: () => fs.readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)),
    directory,
    emit: event => new Promise(resolve => events.write({ event, done: resolve })),
  };
}

const call = (tool = "bash") => ({
  tool,
  sessionID: "fixture-session",
  id: "call",
  input: { command: "printf 'example'", description: "Show example" },
});

test("Atuin ends history with a failure when an OpenCode v2 bash tool errors", async (t) => {
  const { hooks, calls, directory } = await setup(t);
  const event = call();
  await hooks["execute.before"](event);
  await hooks["execute.after"]({ ...event, status: "error", error: new Error("shell failed") });
  // Repeated delivery must not end the same history entry twice.
  await hooks["execute.after"]({ ...event, status: "error", error: new Error("shell failed") });
  assert.deepEqual(calls(), [
    {
      args: ["history", "start", "--author", "opencode", "--author-kind", "agent", "--intent", "Show example", "--", "printf 'example'"],
      cwd: directory,
    },
    { args: ["history", "end", "history-test-id", "--exit", "1"], cwd: directory },
  ]);
});

for (const [tool, result, expectedExit] of [
  ["shell", { metadata: { exit: 0 } }, "0"],
  ["bash", { metadata: { exit: 7 } }, "7"],
  ["bash", { content: "User aborted the command" }, "130"],
  ["shell", { content: [{ type: "text", text: "Command terminated after exceeding timeout 1000 ms" }] }, "124"],
  ["shell", { metadata: { status: "completed", timeout: true }, content: [{ type: "text", text: "Command timed out after 0.14 seconds." }] }, "124"],
  ["shell", { metadata: { status: "completed", timeout: true, exit: 143 } }, "124"],
]) {
  test(`Atuin preserves completed ${tool} exit ${expectedExit}`, async (t) => {
    const { hooks, calls, directory } = await setup(t);
    const event = call(tool);
    await hooks["execute.before"](event);
    // An unrelated tool error must not consume the bash history entry.
    await hooks["execute.after"]({ ...event, tool: "read", status: "error", error: new Error("read failed") });
    await hooks["execute.after"]({ ...event, status: "completed", result });
    assert.equal(calls().length, 2);
    assert.deepEqual(calls()[1], {
      args: ["history", "end", "history-test-id", "--exit", expectedExit], cwd: directory,
    });
  });
}

test("Atuin finishes history when the command has renamed its working directory", async t => {
  const { hooks, calls, directory } = await setup(t);
  const original = path.join(directory, "nested");
  fs.mkdirSync(original);
  const event = call("shell");
  event.input.workdir = "nested";
  await hooks["execute.before"](event);
  fs.renameSync(original, path.join(directory, "renamed"));
  await hooks["execute.after"]({ ...event, status: "completed", result: { metadata: { exit: 0 } } });

  const [started, ended] = calls();
  assert.equal(started?.cwd, original);
  assert.deepEqual(ended, { args: ["history", "end", "history-test-id", "--exit", "0"], cwd: fs.realpathSync(os.homedir()) });
});

for (const exitBeforeHandle of [false, true]) {
  test(`Atuin finalizes background history only on shell exit (early exit: ${exitBeforeHandle})`, async t => {
    const { hooks, calls, directory, emit } = await setup(t);
    const event = call("shell");
    const shellID = "sh_fixture";
    const exited = { type: "shell.exited", data: { id: shellID, status: "exited", exit: 7 } };
    await hooks["execute.before"](event);

    if (exitBeforeHandle) {
      await emit(exited);
      assert.equal(calls().length, 1);
    }
    await hooks["execute.after"]({ ...event, status: "completed", result: { metadata: { status: "running", shellID } } });
    if (!exitBeforeHandle) {
      assert.equal(calls().length, 1);
      await emit({ ...exited, data: { id: "sh_unrelated", status: "exited", exit: 0 } });
      assert.equal(calls().length, 1);
      await emit(exited);
    }
    await emit(exited);
    assert.deepEqual(calls().slice(1), [
      { args: ["history", "end", "history-test-id", "--exit", "7"], cwd: directory },
    ]);
  });
}
