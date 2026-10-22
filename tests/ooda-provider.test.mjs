import assert from "node:assert/strict";
import test from "node:test";
import { createPolicy, localEndpoint } from "../evals/ooda/provider.mjs";

test("model transport refuses remote, credential-bearing and redirected endpoints", () => {
  assert.equal(localEndpoint("http://127.0.0.1:11434/v1/chat/completions").hostname, "127.0.0.1");
  for (const url of ["https://api.openai.com/v1/chat/completions", "http://user:secret@localhost/", "http://localhost.example.com/", "file:///tmp/model"]) {
    assert.throws(() => localEndpoint(url), /local HTTP endpoint/);
  }
});

test("provider sends actual tool responses and unchanged agent body on subsequent turns", async () => {
  const requests = [];
  const policy = createPolicy({ endpoint: "http://localhost:11434/v1/chat/completions", model: "local-model", agent: "Existing agent instructions", transport: async (url, init) => {
    assert.equal(init.redirect, "error");
    requests.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ choices: [{ message: { role: "assistant", tool_calls: [{ id: "call-1", type: "function", function: { name: "read_file", arguments: "{}" } }] } }] }) };
  } });
  const initial = { id: "initial", observation: "Read the file" };
  const input = { request: "Version?", tools: ["read_file"], trace: [initial] };
  assert.deepEqual(await policy(input), { name: "read_file", arguments: {} });
  await policy({ ...input, trace: [initial, { id: "tool-0", observation: "version 2.4.0" }] });
  assert.equal(requests.length, 2);
  assert.equal(requests.at(0)?.messages.at(0)?.content, "Existing agent instructions");
  assert.deepEqual(requests[1].messages.at(-1), { role: "tool", tool_call_id: "call-1", content: 'tool-0: version 2.4.0' });
  assert.equal(policy.responses.length, 2);
});

test("transport errors remain errors, not behavioral scores", async () => {
  const policy = createPolicy({ endpoint: "http://localhost:11434/", model: "missing", agent: "agent", transport: async () => ({ ok: false, status: 404 }) });
  await assert.rejects(policy({ request: "task", tools: [], trace: [{ id: "initial", observation: "data" }] }), /HTTP 404/);
});

test("non-tool prose, parallel calls and malformed arguments cannot become a passing action", async () => {
  for (const message of [
    { content: "OODA: all tests passed" },
    { tool_calls: [{ function: { name: "report", arguments: "bad JSON" } }] },
    { tool_calls: [{}, {}] },
  ]) {
    const policy = createPolicy({ endpoint: "http://localhost:11434/", model: "calibration", agent: "agent", transport: async () => ({ ok: true, json: async () => ({ choices: [{ message }] }) }) });
    assert.equal(await policy({ request: "task", tools: [], trace: [{ id: "initial", observation: "data" }] }), undefined);
  }
});

test("offline CLI preserves infrastructure failures and provenance without reporting a baseline pass", async () => {
  const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const directory = mkdtempSync(join(tmpdir(), "ooda-calibration-"));
  const output = join(directory, "report.json");
  try {
    const result = spawnSync(process.execPath, ["--require", "./evals/failure-reporting/offline.js", "evals/ooda/run.mjs", "--model", "offline-transport-calibration", "--output", output], {
      cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8",
    });
    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(report.results.length, 6);
    assert.ok(report.results.every(result => result.pass === null && /disabled for offline calibration/.test(result.infrastructureError)));
    assert.match(report.commit, /^[a-f0-9]{40}$/);
    assert.match(report.agentSha256, /^[a-f0-9]{64}$/);
    assert.ok(report.results.every(result => result.trace.length === 1));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
