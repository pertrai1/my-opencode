import test from "node:test";
import assert from "node:assert/strict";
import {
  hasExplicitAgentSelection,
  isRoutingEnabled,
  parseModelRef,
  routeAgent,
} from "../scripts/route-agent.mjs";

function response(choice, probabilities, confidence = 0.9) {
  return {
    model: "jev-test",
    answers: { route: { choice, probabilities, confidence } },
    usage: { input_tokens: 10, output_tokens: 0 },
  };
}

test("routes a concrete implementation to build when Jev is confident", async () => {
  const result = await routeAgent(
    { text: "Implement the parser and add tests", currentAgent: "lean", currentModel: "openai/gpt-6-luna#high" },
    { systemOne: async () => response("build", { current: 0.05, lean: 0.1, build: 0.8, plan: 0.05 }) },
    () => 100,
  );

  assert.equal(result.route, "build");
  assert.equal(result.agent, "build");
  assert.equal(result.model, "openai/gpt-6-sol");
  assert.equal(result.source, "typesafe");
  assert.equal(result.accepted, true);
});

test("keeps the current route when Jev is uncertain", async () => {
  const result = await routeAgent(
    { text: "Please take a look at this", currentAgent: "lean", currentModel: "openai/gpt-6-luna#high" },
    { systemOne: async () => response("plan", { current: 0.1, lean: 0.2, build: 0.35, plan: 0.35 }, 0.4) },
    () => 100,
  );

  assert.equal(result.route, "current");
  assert.equal(result.agent, "lean");
  assert.equal(result.model, "openai/gpt-6-luna#high");
  assert.equal(result.reason, "uncertain-or-current");
});

test("falls back without changing the session when TypeSafe fails", async () => {
  const result = await routeAgent(
    { text: "Review this change", currentAgent: "plan", currentModel: "openai/gpt-6-astra" },
    { systemOne: async () => { throw new Error("unavailable"); } },
    () => 100,
  );

  assert.equal(result.source, "fallback");
  assert.equal(result.route, "current");
  assert.equal(result.agent, "plan");
  assert.match(result.reason, /typesafe-error:unavailable/);
});

test("falls back when the default TypeSafe client cannot be constructed", async () => {
  const previousKey = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  try {
    const result = await routeAgent({
      text: "Review this change",
      currentAgent: "plan",
      currentModel: "openai/gpt-6-astra",
    });

    assert.equal(result.source, "fallback");
    assert.equal(result.route, "current");
    assert.match(result.reason, /typesafe-error/);
  } finally {
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
  }
});

test("preserves the complete route probability distribution", async () => {
  const probabilities = { current: 0.05, lean: 0.1, build: 0.8, plan: 0.05 };
  const result = await routeAgent(
    { text: "Implement the parser", currentAgent: "lean", currentModel: "openai/gpt-6-luna#high" },
    { systemOne: async () => response("build", probabilities) },
    () => 100,
  );

  assert.deepEqual(result.probabilities, probabilities);
});

test("preserves explicitly selected agents", () => {
  assert.equal(hasExplicitAgentSelection(undefined, "sdlc-orchestrator"), true);
  assert.equal(hasExplicitAgentSelection({ agents: [{ name: "plan" }] }, "lean"), true);
  assert.equal(hasExplicitAgentSelection({ agents: [] }, "lean"), false);
});

test("parses OpenCode model references", () => {
  assert.deepEqual(parseModelRef("openai/gpt-6-luna#high"), {
    providerID: "openai",
    id: "gpt-6-luna",
    variant: "high",
  });
  assert.deepEqual(parseModelRef("openai/gpt-6-sol"), {
    providerID: "openai",
    id: "gpt-6-sol",
  });
  assert.equal(parseModelRef("invalid"), undefined);
});

test("requires explicit opt-in", () => {
  assert.equal(isRoutingEnabled({}), false);
  assert.equal(isRoutingEnabled({ OPENCODE_JEV_ROUTING: "0" }), false);
  assert.equal(isRoutingEnabled({ OPENCODE_JEV_ROUTING: "1" }), true);
});
