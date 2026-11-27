import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as pluginApi from "@opencode/plugin";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import * as routing from "../scripts/route-agent.mjs";
import * as provenance from "../scripts/routing-provenance.mjs";

function loadRoutingPlugin(logs) {
  const filename = new URL("../plugins/jev-routing.ts", import.meta.url);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  vm.runInNewContext(compiled.outputText, {
    exports,
    require: (id) => {
      if (id === "@opencode/plugin") return pluginApi;
      if (id === "../scripts/route-agent.mjs") return routing;
      if (id === "../scripts/routing-provenance.mjs") return provenance;
      throw new Error(`Unexpected import: ${id}`);
    },
    console: { info: (...args) => logs.push(args) },
    process,
  }, { filename: filename.pathname });
  return exports.default;
}

async function setup(t, get, systemOne, onSwitchAgent) {
  const provider = t.mock.method(TypeSafeClient.prototype, "systemOne", systemOne);
  const environment = { OPENCODE_JEV_ROUTING: "1", TYPESAFE_API_KEY: "synthetic-test-key" };
  for (const [key, value] of Object.entries({ ...environment, OPENCODE_JEV_ROUTING_DRY_RUN: "0" })) {
    const previous = process.env[key];
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
    process.env[key] = value;
  }

  const logs = [];
  const plugin = loadRoutingPlugin(logs);
  let promptHook;
  const switches = [];
  await plugin.setup({
    session: {
      hook: async (name, handler) => { assert.equal(name, "prompt"); promptHook = handler; },
      get,
      switchAgent: async (input) => {
        switches.push(structuredClone(input));
        await onSwitchAgent?.(input);
      },
      switchModel: async (input) => switches.push(structuredClone(input)),
    },
  });
  return { provider, switches, logs, submit: () => promptHook({ sessionID: "synthetic-session", prompt: { text: "Review this change" } }) };
}

test("prompt hook keeps provider error text out of diagnostics and provenance", async (t) => {
  const markers = ["synthetic-hook-credential", "/private/synthetic-project/prompt.txt", "synthetic-provider-response"];
  const { provider, switches, logs, submit } = await setup(t, async () => ({ agent: "lean" }), async () => {
    throw new Error(markers.join("\n"));
  });
  await submit();
  assert.equal(provider.mock.calls.length, 1);
  for (const marker of markers) assert.equal(JSON.stringify(logs).includes(marker), false);
  const decision = logs.find(([message]) => message === "[jev-routing] decision")?.[1];
  assert.equal(decision.source, "fallback");
  assert.equal(decision.route, "current");
  assert.equal(decision.reason, "typesafe-error");
  assert.equal(decision.probability, 0);
  assert.deepEqual(decision.probabilities, {});
  assert.equal(decision.confidence, 0);
  assert.ok(Number.isFinite(decision.latencyMs));
  const record = logs.find(([value]) => value.event === "routing.decision")?.[0];
  assert.equal(record.reason, "typesafe-error");
  assert.equal(record.fallback, true);
  assert.equal(record.selectedAgent, "lean");
  assert.equal(record.selectedModel, undefined);
  assert.deepEqual(switches, []);
});

test("an existing V2 session model bypasses the provider and is preserved", async (t) => {
  const { provider, switches, logs, submit } = await setup(t,
    async () => ({ agent: "lean", model: { providerID: "openai", id: "gpt-6.2-astra", variant: "high" } }),
    async () => { assert.fail("a session with a model should bypass routing"); },
  );
  await submit();
  assert.equal(provider.mock.calls.length, 0);
  assert.deepEqual(switches, []);
  const record = logs.find(([value]) => value.event === "routing.decision")?.[0];
  assert.equal(record.selectedModel, "openai/gpt-6.2-astra#high");
  assert.equal(record.explicitSelectionBypass, true);
});

for (const modelSelectedDuringRouting of [false, true]) {
  test(`a valid decision only applies while the session model is unset (${modelSelectedDuringRouting})`, async (t) => {
    let agent = "lean";
    let model;
    const { provider, switches, submit } = await setup(t, async () => ({ agent, model }), async () => {
      if (modelSelectedDuringRouting) model = { providerID: "openai", id: "manual" };
      return { answers: { route: { choice: "build", probabilities: { build: 0.9 }, confidence: 0.9 } } };
    }, input => { agent = input.agent; });
    await submit();
    assert.equal(provider.mock.calls.length, 1);
    assert.deepEqual(switches, modelSelectedDuringRouting ? [] : [
      { sessionID: "synthetic-session", agent: "build" },
      { sessionID: "synthetic-session", model: { providerID: "openai", id: "gpt-6.2-sol" } },
    ]);
  });
}

for (const manualSelection of ["model", "agent"]) {
  test(`Jev keeps a manual ${manualSelection} selected during the agent switch`, async t => {
    const entered = Promise.withResolvers();
    const finish = Promise.withResolvers();
    const state = { agent: "lean" };
    const { switches, submit } = await setup(t,
      async () => ({ ...state }),
      async () => ({ answers: { route: { choice: "build", probabilities: { build: 0.9 }, confidence: 0.9 } } }),
      async ({ agent }) => {
        state.agent = agent;
        entered.resolve();
        await finish.promise;
      },
    );

    const pending = submit();
    await entered.promise;
    if (manualSelection === "model") state.model = { providerID: "openai", id: "manual" };
    else state.agent = "plan";
    finish.resolve();
    await pending;

    assert.deepEqual(switches, [{ sessionID: "synthetic-session", agent: "build" }]);
  });
}
