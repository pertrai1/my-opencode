import test from "node:test";
import assert from "node:assert/strict";
import {
  POLICY_REVISION,
  ROUTES,
  getRoutingDiagnostic,
  hasExplicitAgentSelection,
  isRoutingEnabled,
  parseModelRef,
  routeAgent,
  sanitizeRoutingInput,
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

test("ignores unknown route names instead of accepting inherited object properties", async () => {
  const result = await routeAgent(
    { text: "Implement the parser", currentAgent: "lean", currentModel: "openai/gpt-6-luna#high" },
    { systemOne: async () => response("toString", {}, 1) },
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
  assert.equal(hasExplicitAgentSelection({ model: "openai/gpt-6-astra" }, "lean"), true);
});

test("exposes a closed, versioned route policy", () => {
  assert.equal(POLICY_REVISION, "jev-route-policy-v1");
  assert.deepEqual(Object.keys(ROUTES).sort(), ["build", "current", "lean", "plan"]);
  for (const route of Object.values(ROUTES)) {
    assert.equal(typeof route.taskClass, "string");
    assert.equal(typeof route.permissionProfile, "string");
    assert.equal(typeof route.sideEffectLevel, "string");
    assert.ok(route.model === undefined || /^openai\/[\w-]+(?:#[\w-]+)?$/.test(route.model));
  }
});

test("keeps routing disabled without a TypeSafe credential and reports safe diagnostics", () => {
  const diagnostic = getRoutingDiagnostic({ OPENCODE_JEV_ROUTING: "1" });
  assert.deepEqual(diagnostic, {
    enabled: false,
    policyRevision: POLICY_REVISION,
    typesafeAvailable: false,
    dryRun: false,
  });
  assert.equal(isRoutingEnabled({ OPENCODE_JEV_ROUTING: "1", TYPESAFE_API_KEY: "secret" }), true);
});

test("supports decision-only dry-run mode", () => {
  assert.deepEqual(getRoutingDiagnostic({
    OPENCODE_JEV_ROUTING: "1",
    TYPESAFE_API_KEY: "secret",
    OPENCODE_JEV_ROUTING_DRY_RUN: "1",
  }), {
    enabled: true,
    policyRevision: POLICY_REVISION,
    typesafeAvailable: true,
    dryRun: true,
  });
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
  assert.equal(isRoutingEnabled({ OPENCODE_JEV_ROUTING: "1" }), false);
  assert.equal(isRoutingEnabled({ OPENCODE_JEV_ROUTING: "1", TYPESAFE_API_KEY: "secret" }), true);
});

test("sends only coarse allowlisted routing metadata to the provider", async () => {
  const credential = "synthetic-secret-123";
  const secrets = [
    credential, "const proprietarySource = 42;",
    "/private/project/customer.txt", "synthetic model response",
  ];
  const text = secrets.join("\n");
  let captured;
  let options;
  const result = await routeAgent({
    text,
    currentAgent: credential,
    currentModel: secrets[2],
    context: {
      attachedFiles: 2, attachedAgents: 1, attachedSkills: 3,
      fileContents: secrets[1], modelResponse: secrets[3],
      toJSON: () => ({ leaked: text }),
    },
  }, {
    systemOne: async (payload, routingOptions) => {
      captured = payload;
      options = routingOptions;
      return response("current", { current: 1 });
    },
  });

  assert.deepEqual(Object.keys(captured).sort(), ["questions", "state"]);
  assert.deepEqual(Object.keys(captured.state).sort(), ["policy", "request"]);
  assert.deepEqual(captured.state.request, {
    requestKind: "nonempty", requestLengthBucket: "short",
    context: { attachedFiles: 2, attachedAgents: 1, attachedSkills: 3 },
  });
  assert.deepEqual(Object.keys(captured.questions), ["route"]);
  const serialized = JSON.stringify(captured);
  for (const secret of [...secrets, text]) assert.equal(serialized.includes(secret), false);
  assert.deepEqual(options, { timeout: 3000, retry: { maxRetries: 0 } });
  assert.equal(result.agent, credential);
  assert.equal(result.model, secrets[2]);
});

test("buckets request length without retaining prompt content or exact length", () => {
  for (const [length, bucket] of [[1, "short"], [256, "short"], [257, "medium"], [2048, "medium"], [2049, "long"], [10000, "long"]]) {
    assert.deepEqual(sanitizeRoutingInput({ text: "x".repeat(length) }), {
      requestKind: "nonempty", requestLengthBucket: bucket,
      context: { attachedFiles: 0, attachedAgents: 0, attachedSkills: 0 },
    });
  }
});

test("includes only configured current agent and model identifiers", () => {
  for (const [currentAgent, currentModel] of [
    ["lean", "openai/gpt-6-luna#high"],
    ["build", "openai/gpt-6-sol"],
    ["plan", "openai/gpt-6-astra"],
  ]) {
    assert.deepEqual(sanitizeRoutingInput({ text: "request", currentAgent, currentModel }), {
      requestKind: "nonempty", requestLengthBucket: "short", currentAgent, currentModel,
      context: { attachedFiles: 0, attachedAgents: 0, attachedSkills: 0 },
    });
  }
  for (const value of ["custom-secret", "toString", "__proto__", {}, ["lean"], null, 42]) {
    const summary = sanitizeRoutingInput({ text: "request", currentAgent: value, currentModel: value });
    assert.equal(Object.hasOwn(summary, "currentAgent"), false);
    assert.equal(Object.hasOwn(summary, "currentModel"), false);
  }
});

test("normalizes malformed context and clamps counts without coercion", () => {
  for (const context of [undefined, null, "synthetic-secret", 42, [], () => {}]) {
    assert.deepEqual(sanitizeRoutingInput({ text: "request", context }).context, {
      attachedFiles: 0, attachedAgents: 0, attachedSkills: 0,
    });
  }
  for (const [value, expected] of [
    [-1, 0], [0, 0], [1.9, 1], [100, 100], [101, 100], [Number.MAX_VALUE, 100],
    [NaN, 0], [Infinity, 0], [-Infinity, 0], ["42", 0], [true, 0], [null, 0],
    [undefined, 0], [1n, 0], [{ valueOf: () => { throw new Error("must not coerce"); } }, 0],
  ]) {
    const context = { attachedFiles: value, attachedAgents: value, attachedSkills: value };
    assert.deepEqual(sanitizeRoutingInput({ text: "request", context }).context, {
      attachedFiles: expected, attachedAgents: expected, attachedSkills: expected,
    });
  }
});

test("empty and non-string requests stay local without a provider call", async () => {
  let calls = 0;
  for (const text of ["", " \n\t", undefined, null, 42, { toString: () => "request" }]) {
    assert.equal(sanitizeRoutingInput({ text }), undefined);
    const result = await routeAgent({ text, currentAgent: "custom", currentModel: "custom/model" }, {
      systemOne: async () => { calls += 1; return response("build", { build: 1 }); },
    });
    assert.equal(result.reason, "empty-request");
    assert.equal(result.agent, "custom");
    assert.equal(result.model, "custom/model");
    assert.equal(result.latencyMs, 0);
  }
  assert.equal(calls, 0);
});

test("sanitization failures fail closed without calling the provider or exposing exception text", async () => {
  let calls = 0;
  const result = await routeAgent({
    text: "synthetic private request", currentAgent: "custom", currentModel: "custom/model",
    context: { get attachedFiles() { throw new Error("synthetic-private-path"); } },
  }, {
    systemOne: async () => { calls += 1; return response("build", { build: 1 }); },
  }, () => 100);
  assert.equal(calls, 0);
  assert.equal(result.source, "fallback");
  assert.equal(result.route, "current");
  assert.equal(result.agent, "custom");
  assert.equal(result.model, "custom/model");
  assert.equal(result.reason, "typesafe-error:invalid-routing-input");
  assert.equal(JSON.stringify(result).includes("synthetic-private-path"), false);
});

test("provider payloads depend only on allowed shape, with no prompt hashes or hidden metadata", async () => {
  const payloads = [];
  for (const text of ["synthetic secret A", "unrelated content"]) {
    await routeAgent({
      text, currentAgent: "lean", currentModel: "openai/gpt-6-luna#high",
      context: { attachedFiles: Infinity, attachedAgents: "synthetic secret", attachedSkills: 1000, text },
    }, { systemOne: async (payload) => {
      payloads.push(JSON.parse(JSON.stringify(payload)));
      return response("current", { current: 1 });
    } });
  }
  assert.equal(payloads.length, 2);
  assert.equal(new Set(payloads.map((payload) => JSON.stringify(payload))).size, 1);
  for (const payload of payloads) assert.deepEqual(payload.state.request, {
    requestKind: "nonempty", requestLengthBucket: "short",
    currentAgent: "lean", currentModel: "openai/gpt-6-luna#high",
    context: { attachedFiles: 0, attachedAgents: 0, attachedSkills: 100 },
  });
});

test("retains confidence and probability thresholds with minimized input", async () => {
  for (const [probability, confidence, expected] of [[0.6, 0.55, "build"], [0.599, 0.55, "current"], [0.6, 0.549, "current"]]) {
    const result = await routeAgent({ text: "request", currentAgent: "plan", currentModel: "openai/gpt-6-astra" }, {
      systemOne: async () => ({ ...response("build", { build: probability }, confidence), ignored: "synthetic secret" }),
    });
    assert.equal(result.route, expected);
    assert.equal(result.reason, expected === "build" ? "threshold-met" : "uncertain-or-current");
    assert.equal(Object.hasOwn(result, "ignored"), false);
  }
});
