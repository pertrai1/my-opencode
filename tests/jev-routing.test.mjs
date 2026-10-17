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

test("prompt hook keeps provider error text out of diagnostics and provenance", async (t) => {
  const markers = ["synthetic-hook-credential", "/private/synthetic-project/prompt.txt", "synthetic-provider-response"];
  const provider = t.mock.method(TypeSafeClient.prototype, "systemOne", async () => {
    throw new Error(markers.join("\n"));
  });
  const environment = { OPENCODE_JEV_ROUTING: "1", TYPESAFE_API_KEY: "synthetic-test-key" };
  for (const [key, value] of Object.entries(environment)) {
    const previous = process.env[key];
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
    process.env[key] = value;
  }

  // Exercise the real prompt hook and router, replacing only the provider boundary.
  const logs = [];
  const plugin = loadRoutingPlugin(logs);
  let promptHook;
  const switches = [];
  await plugin.setup({
    session: {
      hook: async (name, handler) => { assert.equal(name, "prompt"); promptHook = handler; },
      get: async () => ({ agent: "lean", model: { providerID: "openai", id: "gpt-6-luna", variant: "high" } }),
      switchAgent: async (input) => switches.push(input),
      switchModel: async (input) => switches.push(input),
    },
  });
  await promptHook({ sessionID: "synthetic-session", prompt: { text: "Review this change" } });

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
  assert.equal(record.selectedModel, "openai/gpt-6-luna#high");
  assert.deepEqual(switches, []);
});
