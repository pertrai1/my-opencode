import { randomBytes } from "node:crypto";
import { request } from "node:http";

const TOOLS = new Set(["shell", "bash", "subagent", "read", "write", "edit", "patch", "glob", "grep", "webfetch", "websearch", "task", "skill", "question", "todowrite", "todoread"]);
const LIMIT = 128;
const TTL = 600_000;
const attr = (key, value) => ({ key, value: typeof value === "number" ? { intValue: String(value) } : { stringValue: value } });
const nano = (ms) => String(BigInt(Math.trunc(ms)) * 1_000_000n);
const id = (bytes) => randomBytes(bytes).toString("hex");

// Dedicated bounded transport: routing-provenance's fire-and-forget sink has no
// queue/concurrency limit and is intentionally not used as a network exporter.
export function createToolObserver({ enabled = false, port = 4318, now = Date.now, clock = performance.now.bind(performance) } = {}) {
  const pending = new Map();
  const sessions = new Map();
  const queue = [];
  const counts = { overflow: 0, incomplete: 0, unmatched: 0, invalid: 0, exportFailed: 0, rejected: 0, shutdown: 0, sent: 0 };
  let closed = !enabled || !Number.isInteger(port) || port < 1 || port > 65535;
  let flight;
  const bump = (key, amount = 1) => { counts[key] = Math.min(Number.MAX_SAFE_INTEGER, counts[key] + amount); };

  function key(event) {
    if (![event.id, event.sessionID].every(value => typeof value === "string" && value.length > 0 && value.length <= 256)) {
      bump("invalid");
      return undefined;
    }
    return JSON.stringify([event.sessionID, event.id]);
  }

  function expire() {
    const time = clock();
    for (const [key, entry] of pending) {
      if (time - entry.start >= TTL) { pending.delete(key); bump("incomplete"); }
    }
    for (const [key, entry] of sessions) {
      if (time - entry.used >= TTL) sessions.delete(key);
    }
  }

  function session(sessionID) {
    let value = sessions.get(sessionID);
    if (!value) {
      if (sessions.size >= LIMIT) sessions.delete(sessions.keys().next().value);
      value = { traceId: id(16), tools: new Map(), used: clock() };
    }
    value.used = clock();
    sessions.delete(sessionID);
    sessions.set(sessionID, value);
    return value;
  }

  function before(event) {
    expire();
    const call = key(event);
    if (!call || pending.has(call)) return;
    if (pending.size >= LIMIT) { bump("overflow"); return; }
    const tool = TOOLS.has(event.tool) ? event.tool : "other";
    const group = session(event.sessionID);
    const occurrence = tool === "other" ? 0 : Math.min(Number.MAX_SAFE_INTEGER, (group.tools.get(tool) ?? 0) + 1);
    group.tools.set(tool, occurrence);
    pending.set(call, { tool, traceId: group.traceId, occurrence, start: clock(), wall: now() });
  }

  function after(event) {
    expire();
    const call = key(event);
    if (!call) return;
    const entry = pending.get(call);
    if (!entry) { bump("unmatched"); return; }
    pending.delete(call);
    if (!["completed", "error"].includes(event.status)) { bump("invalid"); return; }
    if (queue.length >= LIMIT) { bump("overflow"); return; }
    // Read only the documented numeric shell exit metadata, never output text.
    const exit = event.status === "completed" && (entry.tool === "shell" || entry.tool === "bash") ? event.result?.metadata?.exit : undefined;
    const failed = event.status === "error" || (typeof exit === "number" && Number.isFinite(exit) && exit !== 0);
    const duration = Math.max(0, clock() - entry.start);
    queue.push({
      traceId: entry.traceId, spanId: id(8), name: "opencode.tool", kind: 1,
      startTimeUnixNano: nano(entry.wall), endTimeUnixNano: nano(entry.wall + duration),
      attributes: [attr("opencode.tool.name", entry.tool), attr("opencode.tool.occurrence", entry.occurrence), attr("opencode.tool.outcome", failed ? "error" : "completed")],
      status: { code: failed ? 2 : 1 },
    });
  }

  function flush() {
    if (closed || flight || queue.length === 0) return;
    const spans = queue.splice(0, 16);
    const body = JSON.stringify({ resourceSpans: [{
      resource: { attributes: [attr("service.name", "my-opencode-tool-observer"), ...Object.entries(counts).map(([key, value]) => attr(`opencode.observer.${key}`, value))] },
      scopeSpans: [{ scope: { name: "my-opencode.tool-observation", version: "1" }, spans }],
    }] });
    let settled = false;
    let timer;
    const finish = (failed, rejected = 0) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      flight = undefined;
      if (failed) bump("exportFailed", spans.length);
      else { bump("rejected", rejected); bump("sent", spans.length - rejected); }
    };
    try {
      // Explicit numeric loopback; no DNS, proxy, redirects, ambient OTEL headers,
      // resource attributes, credentials, retries, or inherited trace context.
      const req = request({ hostname: "127.0.0.1", port, path: "/v1/traces", method: "POST", agent: false,
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } }, res => {
        let reply = "";
        res.on("data", chunk => {
          if (reply.length + chunk.length > 4096) { finish(true); req.destroy(); return; }
          reply += chunk;
        });
        res.on("error", () => finish(true));
        res.on("end", () => {
          try {
            if (res.statusCode !== 200) { finish(true); return; }
            const response = JSON.parse(reply);
            const rejected = Number(response.partialSuccess?.rejectedSpans ?? 0);
            if (!Number.isInteger(rejected) || rejected < 0 || rejected > spans.length) { finish(true); return; }
            finish(false, rejected);
          } catch { finish(true); }
        });
      });
      flight = req;
      req.on("error", () => finish(true));
      req.on("close", () => finish(true));
      timer = setTimeout(() => { finish(true); req.destroy(); }, 500);
      timer.unref();
      req.end(body);
    } catch { finish(true); }
  }

  // All callbacks are observation-only, including malformed event handling.
  const safe = work => event => { if (!closed) { try { work(event); } catch { bump("invalid"); } } };
  const tick = safe(() => { expire(); flush(); });
  const timer = closed ? undefined : setInterval(tick, 1000);
  timer?.unref();
  return {
    before: safe(before), after: safe(after), flush: safe(flush),
    stats: () => ({ ...counts, pending: pending.size, queued: queue.length, sessions: sessions.size, inFlight: Boolean(flight) }),
    close() {
      closed = true;
      clearInterval(timer);
      bump("shutdown", queue.length + pending.size);
      queue.length = 0;
      pending.clear();
      sessions.clear();
      flight?.destroy();
    },
  };
}
