import test from "node:test";
import assert from "node:assert/strict";
import { routeAgent } from "../scripts/route-agent.mjs";
import {
  createRoutingProvenance,
  emitRoutingProvenance,
} from "../scripts/routing-provenance.mjs";

const SESSION_ID = "sess_opaque_01HXYZ";
const TIMESTAMP = "2026-09-29T16:00:00.000Z";
const CURRENT_AGENT = "lean";
const CURRENT_MODEL = "openai/gpt-6-luna#high";

function typesafeResponse(choice, probabilities, confidence = 0.9) {
  return {
    model: "jev-test",
    answers: { route: { choice, probabilities, confidence } },
    usage: { input_tokens: 10, output_tokens: 0 },
  };
}

function provenance(decision, overrides = {}) {
  return createRoutingProvenance({
    sessionId: SESSION_ID,
    timestamp: TIMESTAMP,
    currentAgent: CURRENT_AGENT,
    currentModel: CURRENT_MODEL,
    decision,
    ...overrides,
  });
}

const ACCEPTED_KEYS = [
  "version",
  "event",
  "sessionId",
  "timestamp",
  "source",
  "currentAgent",
  "currentModel",
  "selectedRoute",
  "selectedAgent",
  "selectedModel",
  "confidence",
  "probability",
  "latencyMs",
  "accepted",
  "reason",
  "fallback",
  "explicitSelectionBypass",
];

test("records an accepted Jev route using the stable v1 contract", async () => {
  const decision = await routeAgent(
    { text: "Implement the parser", currentAgent: CURRENT_AGENT, currentModel: CURRENT_MODEL },
    {
      systemOne: async () => typesafeResponse("build", {
        current: 0.05,
        lean: 0.1,
        build: 0.8,
        plan: 0.05,
      }),
    },
    () => 100,
  );

  const record = provenance(decision);

  assert.deepEqual(Object.keys(record).sort(), [...ACCEPTED_KEYS].sort());
  assert.deepEqual(record, {
    version: 1,
    event: "routing.decision",
    sessionId: SESSION_ID,
    timestamp: TIMESTAMP,
    source: "jev",
    currentAgent: CURRENT_AGENT,
    currentModel: CURRENT_MODEL,
    selectedRoute: "build",
    selectedAgent: "build",
    selectedModel: "openai/gpt-6-sol",
    confidence: 0.9,
    probability: 0.8,
    latencyMs: 0,
    accepted: true,
    reason: "threshold-met",
    fallback: false,
    explicitSelectionBypass: false,
  });
});

test("records an uncertain Jev decision as unaccepted without changing the current route", async () => {
  const decision = await routeAgent(
    { text: "Please take a look", currentAgent: CURRENT_AGENT, currentModel: CURRENT_MODEL },
    {
      systemOne: async () => typesafeResponse("plan", {
        current: 0.1,
        lean: 0.2,
        build: 0.35,
        plan: 0.35,
      }, 0.4),
    },
    () => 100,
  );

  const record = provenance(decision);

  assert.equal(record.source, "jev");
  assert.equal(record.selectedRoute, "current");
  assert.equal(record.selectedAgent, CURRENT_AGENT);
  assert.equal(record.selectedModel, CURRENT_MODEL);
  assert.equal(record.accepted, false);
  assert.equal(record.fallback, false);
  assert.equal(record.explicitSelectionBypass, false);
});

test("records a TypeSafe failure as a privacy-safe fallback", async () => {
  const credential = "test-secret-credential-do-not-record";
  const decision = await routeAgent(
    { text: "Review this change", currentAgent: CURRENT_AGENT, currentModel: CURRENT_MODEL },
    {
      systemOne: async () => {
        throw new Error(`provider rejected credential ${credential}`);
      },
    },
    () => 100,
  );

  const record = provenance(decision);

  assert.equal(record.source, "fallback");
  assert.equal(record.selectedRoute, "current");
  assert.equal(record.currentAgent, CURRENT_AGENT);
  assert.equal(record.selectedAgent, CURRENT_AGENT);
  assert.equal(record.currentModel, CURRENT_MODEL);
  assert.equal(record.selectedModel, CURRENT_MODEL);
  assert.equal(record.accepted, false);
  assert.equal(record.fallback, true);
  assert.match(record.reason, /^typesafe-error/);
  assert.doesNotMatch(JSON.stringify(record), new RegExp(credential));
});

test("records an empty request as a fallback without calling TypeSafe", async () => {
  let calls = 0;
  const decision = await routeAgent(
    { text: "  ", currentAgent: CURRENT_AGENT, currentModel: CURRENT_MODEL },
    { systemOne: async () => { calls += 1; return typesafeResponse("build", {}); } },
    () => 100,
  );

  const record = provenance(decision);

  assert.equal(calls, 0);
  assert.equal(record.source, "fallback");
  assert.equal(record.selectedRoute, "current");
  assert.equal(record.accepted, false);
  assert.equal(record.fallback, true);
  assert.equal(record.reason, "empty-request");
});

test("records an explicit agent selection bypass separately from Jev routing", () => {
  const record = provenance({
    source: "explicit",
    route: "current",
    agent: "plan",
    model: "openai/gpt-6-astra",
    accepted: false,
    reason: "explicit-selection-bypass",
  }, {
    explicitSelectionBypass: true,
  });

  assert.equal(record.source, "explicit");
  assert.equal(record.currentAgent, CURRENT_AGENT);
  assert.equal(record.currentModel, CURRENT_MODEL);
  assert.equal(record.selectedRoute, "current");
  assert.equal(record.selectedAgent, "plan");
  assert.equal(record.selectedModel, "openai/gpt-6-astra");
  assert.equal(record.accepted, false);
  assert.equal(record.fallback, false);
  assert.equal(record.explicitSelectionBypass, true);
});

test("records only allowlisted metadata, never request, file, credential, or response content", async () => {
  const privateText = "private-prompt-content-never-record";
  const decision = await routeAgent(
    { text: privateText, currentAgent: CURRENT_AGENT, currentModel: CURRENT_MODEL },
    {
      systemOne: async () => ({
        ...typesafeResponse("build", { current: 0.05, lean: 0.1, build: 0.8, plan: 0.05 }),
        rawResponse: privateText,
      }),
    },
    () => 100,
  );
  const record = provenance({
    ...decision,
    prompt: privateText,
    attachedFiles: [{ content: privateText }],
    credential: privateText,
    modelResponse: privateText,
  });
  const serialized = JSON.stringify(record);

  assert.doesNotMatch(serialized, new RegExp(privateText));
  assert.equal("prompt" in record, false);
  assert.equal("attachedFiles" in record, false);
  assert.equal("credential" in record, false);
  assert.equal("modelResponse" in record, false);
  assert.equal("usage" in record, false);
  assert.equal("rawResponse" in record, false);
  assert.equal("requestDigest" in record, false);
});

test("does not send provenance to the sink while routing is disabled", async () => {
  let calls = 0;
  const record = provenance({
    source: "fallback",
    route: "current",
    agent: CURRENT_AGENT,
    model: CURRENT_MODEL,
    accepted: false,
    reason: "typesafe-error",
  });

  await emitRoutingProvenance(record, async () => { calls += 1; }, { enabled: false });

  assert.equal(calls, 0);
});

test("isolates sink failures from the route decision", async () => {
  const decision = await routeAgent(
    { text: "Implement the parser", currentAgent: CURRENT_AGENT, currentModel: CURRENT_MODEL },
    {
      systemOne: async () => typesafeResponse("build", {
        current: 0.05,
        lean: 0.1,
        build: 0.8,
        plan: 0.05,
      }),
    },
    () => 100,
  );
  const record = provenance(decision);

  for (const sink of [
    () => { throw new Error("synchronous sink failure"); },
    async () => { throw new Error("asynchronous sink failure"); },
  ]) {
    await assert.doesNotReject(() => emitRoutingProvenance(
      record,
      sink,
      { enabled: true },
    ));
  }

  assert.equal(decision.route, "build");
  assert.equal(decision.agent, "build");
  assert.equal(decision.model, "openai/gpt-6-sol");
  assert.equal(record.selectedRoute, "build");
  assert.equal(record.selectedAgent, "build");
  assert.equal(record.selectedModel, "openai/gpt-6-sol");
});
