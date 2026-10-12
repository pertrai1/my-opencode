import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import net from "node:net";
import { test } from "node:test";

test("Herdr keeps the root pane session when v2 child sessions report status", async (t) => {
  const original = { ...process.env };
  process.env.HERDR_ENV = "1";
  process.env.HERDR_SOCKET_PATH = "/unused/herdr-test.socket";
  process.env.HERDR_PANE_ID = "test-pane";
  t.after(() => {
    for (const key of ["HERDR_ENV", "HERDR_SOCKET_PATH", "HERDR_PANE_ID"]) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  const reports = [];
  t.mock.method(net, "createConnection", (_endpoint, connected) => {
    const socket = new EventEmitter();
    socket.setTimeout = () => socket;
    socket.destroy = () => {};
    socket.write = (line) => {
      reports.push(JSON.parse(line));
      queueMicrotask(() => socket.emit("data", "ok"));
    };
    queueMicrotask(connected);
    return socket;
  });

  const events = [
    { type: "session.created", data: { sessionID: "root", agent: "build" } },
    { type: "session.status", data: { sessionID: "root", status: { type: "busy" } } },
    { type: "session.created", data: { sessionID: "child", parentID: "root", agent: "explore" } },
    { type: "session.status", data: { sessionID: "child", status: { type: "idle" } } },
    { type: "permission.asked", data: { sessionID: "child" } },
    { type: "permission.replied", data: { sessionID: "child" } },
    { type: "session.idle", data: { sessionID: "root" } },
  ];
  const consumed = Promise.withResolvers();
  const { default: plugin } = await import("../plugins/herdr-agent-state.js");
  const dispose = plugin.setup({ event: { subscribe: async function* () {
    try {
      yield* events;
    } finally {
      consumed.resolve();
    }
  } } });
  t.after(dispose);
  await consumed.promise;

  assert.deepEqual(reports.map(({ method, params }) => ({
    method,
    session: params.agent_session_id,
    state: params.state,
  })), [
    { method: "pane.report_agent_session", session: "root", state: undefined },
    { method: "pane.report_agent", session: "root", state: "working" },
    { method: "pane.report_agent", session: undefined, state: "blocked" },
    { method: "pane.report_agent", session: undefined, state: "working" },
    { method: "pane.report_agent", session: "root", state: "idle" },
  ]);
});
