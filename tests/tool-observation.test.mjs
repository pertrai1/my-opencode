import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createToolObserver } from "../scripts/tool-observation.mjs";
import plugin from "../plugins/tool-observation.ts";

const event = (id = "call", tool = "shell", sessionID = "private-session") => ({ id, tool, sessionID, input: { command: "SECRET /private/file" }, agent: "SECRET", messageID: "SECRET" });
async function receiver(t, handle) {
  const server = createServer(handle);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  return server.address().port;
}
async function until(check) {
  for (let i = 0; i < 100 && !check(); i++) await delay(10);
  assert.ok(check(), "condition reached within one second");
}

test("OTLP HTTP exports only allowlisted observations with durations, failures and occurrences", async t => {
  let payload;
  const port = await receiver(t, (req, res) => {
    assert.equal(req.url, "/v1/traces");
    assert.equal(req.headers["content-type"], "application/json");
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => { payload = JSON.parse(body); res.end("{}"); });
  });
  let time = 100;
  const observer = createToolObserver({ enabled: true, port, now: () => 1700000000000, clock: () => time });
  t.after(observer.close);
  for (const [index, status, tool] of [[1, "error", "shell"], [2, "completed", "shell"], [3, "completed", "SECRET-tool"]]) {
    const input = event(String(index), tool);
    const output = { ...input, status, result: { content: "SECRET", metadata: { exit: index === 2 ? 7 : 0 } }, error: new Error("SECRET") };
    const before = structuredClone(output);
    observer.before(input);
    time += 25;
    observer.after(output);
    assert.deepEqual(output, before);
  }
  observer.flush();
  await until(() => observer.stats().sent === 3);
  assert.doesNotMatch(JSON.stringify(payload), /SECRET|private-session|\/private|command|messageID/);
  const spans = payload.resourceSpans[0].scopeSpans[0].spans;
  assert.equal(spans.length, 3);
  const first = spans.at(0);
  assert.ok(first);
  assert.match(first.traceId, /^[0-9a-f]{32}$/);
  assert.match(first.spanId, /^[0-9a-f]{16}$/);
  assert.equal(first.traceId, spans[1].traceId);
  assert.equal(BigInt(first.endTimeUnixNano) - BigInt(first.startTimeUnixNano), 25000000n);
  assert.deepEqual(spans.map(s => s.status.code), [2, 2, 1]);
  assert.deepEqual(spans.map(s => s.attributes[1].value.intValue), ["1", "2", "0"]);
  assert.equal(spans[2].attributes[0].value.stringValue, "other");
});

test("disabled observer and plugin register no hooks or timers", async () => {
  const observer = createToolObserver();
  observer.before(event());
  observer.after({ ...event(), status: "error" });
  assert.equal(observer.stats().pending, 0);
  const old = process.env.OPENCODE_TOOL_OBSERVATION;
  delete process.env.OPENCODE_TOOL_OBSERVATION;
  try { await plugin.setup({ tool: { hook() { assert.fail("must stay off"); } } }); }
  finally { if (old !== undefined) process.env.OPENCODE_TOOL_OBSERVATION = old; }
});

test("pending, sessions, queue and export concurrency are bounded; missing ends expire", async t => {
  const port = await receiver(t, () => {});
  let time = 0;
  const observer = createToolObserver({ enabled: true, port, clock: () => time });
  t.after(observer.close);
  for (let i = 0; i < 140; i++) observer.before(event(String(i)));
  assert.equal(observer.stats().pending, 128);
  assert.equal(observer.stats().overflow, 12);
  time = 600001;
  observer.before(event("new"));
  assert.equal(observer.stats().incomplete, 128);
  for (let i = 0; i < 140; i++) {
    const input = event(String(i), "read", String(i));
    observer.before(input);
    observer.after({ ...input, status: "completed" });
  }
  assert.equal(observer.stats().queued, 128);
  assert.equal(observer.stats().sessions, 128);
  observer.flush();
  observer.flush();
  assert.equal(observer.stats().queued, 112);
  await until(() => observer.stats().exportFailed === 16);
  observer.close();
  assert.equal(observer.stats().pending, 0);
  assert.equal(observer.stats().queued, 0);
  assert.equal(observer.stats().shutdown, 113);
});

test("duplicates and invalid events do not mutate results; session IDs isolate repeated calls", t => {
  const observer = createToolObserver({ enabled: true });
  t.after(observer.close);
  observer.before(event());
  observer.before(event());
  observer.before(event("call", "read", "another"));
  observer.after({ ...event(), status: "error" });
  observer.after({ ...event(), status: "error" });
  observer.before(null);
  observer.before(event("x".repeat(257)));
  assert.equal(observer.stats().queued, 1);
  assert.equal(observer.stats().pending, 1);
  assert.equal(observer.stats().unmatched, 1);
  assert.equal(observer.stats().invalid, 2);
});

for (const [name, reply, code, failed, rejected] of [
  ["unavailable", "{}", 503, 1, 0],
  ["redirect", "{}", 302, 1, 0],
  ["oversized", "x".repeat(5000), 200, 1, 0],
  ["invalid", "not json", 200, 1, 0],
  ["partial", '{"partialSuccess":{"rejectedSpans":"1","errorMessage":"SECRET"}}', 200, 0, 1],
]) {
  test(`export ${name} is contained and counted`, async t => {
    const port = await receiver(t, (_req, res) => { res.writeHead(code); res.end(reply); });
    const observer = createToolObserver({ enabled: true, port });
    t.after(observer.close);
    observer.before(event());
    observer.after({ ...event(), status: "error" });
    observer.flush();
    await until(() => !observer.stats().inFlight);
    assert.equal(observer.stats().exportFailed, failed);
    assert.equal(observer.stats().rejected, rejected);
  });
}

test("enabled V2 plugin observes simulated hooks and cleanup cancels outstanding work", async t => {
  const old = process.env.OPENCODE_TOOL_OBSERVATION;
  process.env.OPENCODE_TOOL_OBSERVATION = "1";
  t.after(() => { if (old === undefined) delete process.env.OPENCODE_TOOL_OBSERVATION; else process.env.OPENCODE_TOOL_OBSERVATION = old; });
  const hooks = {};
  const close = await plugin.setup({ tool: { hook: async (name, callback) => { hooks[name] = callback; } } });
  const input = Object.freeze(event());
  hooks["execute.before"](input);
  hooks["execute.after"](Object.freeze({ ...input, status: "error", error: new Error("SECRET") }));
  close();
  hooks["execute.before"](input);
});

test("recovery exports cumulative loss counters without copying error payloads", async t => {
  const bodies = [];
  const port = await receiver(t, (req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      bodies.push(JSON.parse(body));
      res.writeHead(bodies.length === 1 ? 503 : 200);
      res.end('{}');
    });
  });
  const observer = createToolObserver({ enabled: true, port });
  t.after(observer.close);
  for (let i = 0; i < 2; i++) {
    observer.before(event(String(i)));
    observer.after({ ...event(String(i)), status: "error", error: new Error("SECRET") });
    observer.flush();
    await until(() => !observer.stats().inFlight);
  }
  assert.equal(observer.stats().sent, 1);
  const resource = bodies.at(-1).resourceSpans.at(0).resource;
  assert.deepEqual(resource.attributes.find(a => a.key === "opencode.observer.exportFailed").value, { intValue: "1" });
  assert.doesNotMatch(JSON.stringify(bodies), /SECRET/);
});

test("cleanup cancels a stalled exporter without waiting or changing tool events", async t => {
  const port = await receiver(t, () => {});
  const observer = createToolObserver({ enabled: true, port });
  t.after(observer.close);
  observer.before(event());
  const result = Object.freeze({ ...event(), status: "completed", result: Object.freeze({ content: "SECRET" }) });
  assert.equal(observer.after(result), undefined);
  observer.flush();
  assert.equal(observer.stats().inFlight, true);
  assert.equal(observer.close(), undefined);
  await until(() => !observer.stats().inFlight);
  assert.equal(observer.stats().exportFailed, 1);
  assert.equal(result.result.content, "SECRET");
});

test("session retention resets correlation and counts, and refused connections drop batches", async t => {
  let time = 0;
  const received = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => { received.push(...JSON.parse(body).resourceSpans.at(0).scopeSpans.at(0).spans); res.end("{}"); });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const observer = createToolObserver({ enabled: true, port: server.address().port, clock: () => time });
  t.after(observer.close);
  for (let i = 0; i < 2; i++) {
    observer.before(event(String(i)));
    observer.after({ ...event(String(i)), status: "completed" });
    time += 600001;
  }
  observer.flush();
  await until(() => observer.stats().sent === 2);
  assert.notEqual(received.at(0).traceId, received.at(1).traceId);
  assert.deepEqual(received.map(s => s.attributes.at(1).value.intValue), ["1", "1"]);
  await new Promise(resolve => server.close(resolve));
  observer.before(event("refused"));
  observer.after({ ...event("refused"), status: "error" });
  observer.flush();
  await until(() => observer.stats().exportFailed === 1);
});

// Names and metadata from V2 core/src/tool/plugin/{shell,subagent}.ts,
// upstream 09a1db3b088293d48d84d62e86c02b69b40ed3ee. Legacy names remain supported.
for (const tool of ["shell", "subagent", "bash", "task"]) {
  test(`${tool} retains its category and counts repeated V2 hook observations`, async t => {
    let spans;
    const port = await receiver(t, (req, res) => {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => { spans = JSON.parse(body).resourceSpans.at(0).scopeSpans.at(0).spans; res.end("{}"); });
    });
    const observer = createToolObserver({ enabled: true, port });
    t.after(observer.close);
    for (let i = 1; i <= 2; i++) {
      const input = event(String(i), tool);
      const result = {
        output: { output: "SECRET", sessionID: "PRIVATE-child", exit: i === 1 ? 7 : 0 },
        content: [{ type: "text", text: "SECRET" }],
        metadata: { status: "completed", exit: i === 1 ? 7 : 0, shellID: "PRIVATE-shell" },
      };
      const after = { ...input, status: "completed", result };
      const original = structuredClone(after);
      observer.before(input);
      observer.after(after);
      assert.deepEqual(after, original);
    }
    observer.flush();
    await until(() => observer.stats().sent === 2);
    assert.deepEqual(spans.map(s => s.attributes.at(0).value.stringValue), [tool, tool]);
    assert.deepEqual(spans.map(s => s.attributes.at(1).value.intValue), ["1", "2"]);
    assert.deepEqual(spans.map(s => s.status.code), [tool === "shell" || tool === "bash" ? 2 : 1, 1]);
    assert.doesNotMatch(JSON.stringify(spans), /SECRET|PRIVATE/);
  });
}
