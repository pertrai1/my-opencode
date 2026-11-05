import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { Tool } from "@opencode/schema/tool";
import safety from "../plugins/safety.ts";
import { createToolObserver } from "../scripts/tool-observation.mjs";

async function setup(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "safety-v2-"));
  const hooks = {};
  const dispose = await safety.setup({
    options: { ...options, truncation: { tempDir: directory, ...options.truncation } },
    event: { subscribe: async function* () {} },
    session: { hook: async () => {} },
    permission: { hook: async () => {} },
    tool: { hook: async (name, handler) => { hooks[name] = handler; } },
  });
  t.after(() => {
    dispose();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { after: hooks["execute.after"], directory };
}

function completed(content, sessionID = "v2-session") {
  return {
    tool: "shell", sessionID, agent: "build", messageID: "message", id: "call",
    input: { command: "fixture" }, status: "completed",
    result: { content, metadata: { exit: 0, title: "Fixture" }, output: { ok: true } },
  };
}

const text = value => Tool.TextContent.make({ type: "text", text: value });
const file = () => Tool.FileContent.make({ type: "file", uri: "file:///tmp/fixture.png", mime: "image/png", name: "fixture.png" });

for (const order of ["safety-first", "observer-first"]) {
  test(`real command output survives v2 hook and observation (${order})`, async t => {
    const { after } = await setup(t);
    const stdout = execFileSync(process.execPath, ["-e", 'process.stdout.write("fixture-version=2.0.12\\n")'], { encoding: "utf8" });
    const event = completed([text(stdout), file(), text("done")]);
    const expected = structuredClone(event.result);
    const observer = createToolObserver({ enabled: true });
    t.after(observer.close);
    observer.before(event);
    if (order === "observer-first") observer.after(event);
    await after(event);
    if (order === "safety-first") observer.after(event);
    assert.deepEqual(event.result, expected);
    assert.equal(event.result.content[0].text.match(/fixture-version=(.*)/)[1], "2.0.12");
    assert.equal(observer.stats().unmatched ?? 0, 0);
  });
}

test("v2 text blocks redact quoted credentials without changing file blocks or result metadata", async t => {
  const { after, directory } = await setup(t);
  const event = completed([text('password="synthetic secret"\n'), file(), text('api_key="synthetic key"')]);
  const attachment = event.result.content[1];
  const metadata = event.result.metadata;
  const output = event.result.output;
  await after(event);
  assert.deepEqual(event.result.content, [text('password="[REDACTED]"\n'), attachment, text('api_key="[REDACTED]"')]);
  assert.equal(event.result.content[1], attachment);
  assert.equal(event.result.metadata, metadata);
  assert.equal(event.result.output, output);
  assert.deepEqual(fs.readdirSync(directory), []);
});

for (const failRetention of [false, true]) {
  test(`oversized v2 text remains redacted with retention ${failRetention ? "failure" : "success"}`, async t => {
    const { after, directory } = await setup(t, { truncation: { maxLength: 40, headLength: 20, tailLength: 20, ...(failRetention ? { tempDir: "/dev/null/invalid" } : {}) } });
    const raw = 'password="synthetic secret"\n' + "ordinary output\n".repeat(10);
    const event = completed([file(), text(raw), text("finished")]);
    const attachment = event.result.content[0];
    await after(event);
    assert.equal(event.result.content[0], attachment);
    assert.equal(event.result.content[2].text, "finished");
    assert.doesNotMatch(JSON.stringify(event.result), /synthetic secret/);
    if (failRetention) {
      assert.equal(event.result.content[1].text, raw.replace("synthetic secret", "[REDACTED]"));
    } else {
      assert.match(event.result.content[1].text, /Output truncated/);
      const artifacts = fs.readdirSync(directory);
      assert.equal(artifacts.length, 1);
      const [artifactName = ""] = artifacts;
      const artifact = path.join(directory, artifactName);
      assert.equal(fs.readFileSync(artifact, "utf8"), raw.replace("synthetic secret", "[REDACTED]"));
      assert.equal(fs.statSync(artifact).mode & 0o777, 0o600);
    }
  });
}

test("absent, empty, and file-only content are preserved", async t => {
  const { after } = await setup(t);
  for (const content of [undefined, [], [file()]]) {
    const event = completed(content);
    if (content === undefined) delete event.result.content;
    const expected = structuredClone(event.result);
    await after(event);
    assert.deepEqual(event.result, expected);
  }
});

test("doom-loop detection distinguishes structured results and still detects identical calls", async t => {
  const { after } = await setup(t);
  for (const value of ["one", "two", "three"]) await after(completed([text(value)], "changing"));
  for (let i = 0; i < 2; i++) await after(completed([text("same")], "repeating"));
  await assert.rejects(async () => after(completed([text("same")], "repeating")), /DOOM LOOP DETECTED/);
});


test("failed tool events pass through without requiring a result", async t => {
  const { after } = await setup(t);
  const event = { ...completed([]), status: "error", error: new Error("fixture failure") };
  delete event.result;
  await after(event);
  assert.equal(event.result, undefined);
  assert.equal(event.error.message, "fixture failure");
});
