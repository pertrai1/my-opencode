import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import plugin from "../plugins/atuin.ts";

async function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "atuin-test-"));
  const log = path.join(directory, "calls.jsonl");
  fs.writeFileSync(path.join(directory, "atuin"), `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, cwd: process.cwd() }) + "\\n");
if (args[1] === "start") process.stdout.write("history-test-id\\n");
`, { mode: 0o700 });
  const previousPath = process.env.PATH;
  process.env.PATH = `${directory}:${previousPath}`;
  t.after(() => {
    process.env.PATH = previousPath;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const hooks = {};
  await plugin.setup({
    location: { directory },
    tool: { hook: async (name, handler) => { hooks[name] = handler; } },
  });
  return {
    hooks,
    calls: () => fs.readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)),
    directory,
  };
}

const call = () => ({
  tool: "bash",
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

for (const [result, expectedExit] of [
  [{ metadata: { exit: 0 } }, "0"],
  [{ metadata: { exit: 7 } }, "7"],
  [{ content: "User aborted the command" }, "130"],
  [{ content: "Command terminated after exceeding timeout 1000 ms" }, "124"],
]) {
  test(`Atuin preserves completed bash exit ${expectedExit}`, async (t) => {
    const { hooks, calls, directory } = await setup(t);
    const event = call();
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
