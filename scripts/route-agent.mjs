import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

export const ROUTING_OPTIONS = {
  timeout: 3000,
  retry: { maxRetries: 0 },
};

export const ROUTES = {
  current: {
    description: "Keep the session's current agent and model because the request is routine, already well-scoped, or uncertain.",
    agent: undefined,
    model: undefined,
  },
  lean: {
    description: "Use the reduced-context lean agent for a routine, local, low-risk request.",
    agent: "lean",
    model: "openai/gpt-6-luna#high",
  },
  build: {
    description: "Use the build agent for a concrete implementation or debugging request with moderate complexity.",
    agent: "build",
    model: "openai/gpt-6-sol",
  },
  plan: {
    description: "Use the plan agent for architecture, review, planning, or ambiguous/high-risk work.",
    agent: "plan",
    model: "openai/gpt-6-astra",
  },
};

export const ROUTING_POLICY = {
  minProbability: 0.6,
  minConfidence: 0.55,
};

export function routingQuestion() {
  return choice(
    "Which configured OpenCode route is the safest and most effective first handler for this user request? Choose current when the evidence is insufficient or the current route is already appropriate.",
    Object.fromEntries(
      Object.entries(ROUTES).map(([route, definition]) => [route, definition.description]),
    ),
  );
}

function probabilityFor(answer, route) {
  const probabilities = answer?.probabilities;
  if (probabilities && typeof probabilities[route] === "number") return probabilities[route];
  return answer?.choice === route ? 1 : 0;
}

export function hasExplicitAgentSelection(
  prompt,
  currentAgent,
) {
  return Boolean(
    prompt?.agents?.some((agent) => typeof agent.name === "string")
      || currentAgent === "sdlc-orchestrator",
  );
}

export function parseModelRef(model) {
  if (typeof model !== "string" || model.length === 0) return undefined;
  const [ref, variant] = model.split("#", 2);
  const separator = ref.indexOf("/");
  if (separator <= 0 || separator === ref.length - 1) return undefined;
  return {
    providerID: ref.slice(0, separator),
    id: ref.slice(separator + 1),
    ...(variant ? { variant } : {}),
  };
}

export function routeFallback({ currentAgent, currentModel, reason = "fallback" } = {}) {
  return {
    source: "fallback",
    route: "current",
    agent: currentAgent,
    model: currentModel,
    probability: 0,
    probabilities: {},
    confidence: 0,
    reason,
  };
}

export async function routeAgent(
  { text, currentAgent, currentModel, context = {} },
  client,
  now = () => performance.now(),
) {
  const started = now();
  if (typeof text !== "string" || text.trim().length === 0) {
    return { ...routeFallback({ currentAgent, currentModel, reason: "empty-request" }), latencyMs: 0 };
  }

  try {
    const response = await (client ?? new TypeSafeClient()).systemOne({
      state: {
        request: text,
        current: { agent: currentAgent, model: currentModel },
        context,
        policy: {
          purpose: "Select the least powerful configured route that can safely handle the request.",
          constraints: [
            "Do not select a route because it sounds more capable when a simpler route is sufficient.",
            "Use plan for architecture, review, planning, or material ambiguity.",
            "Use build for implementation or debugging work.",
            "Use lean for routine local work.",
            "Use current when the request is underspecified or evidence is insufficient.",
          ],
        },
      },
      questions: { route: routingQuestion() },
    }, ROUTING_OPTIONS);

    const answer = response.answers?.route;
    const route = typeof answer?.choice === "string" && ROUTES[answer.choice]
      ? answer.choice
      : "current";
    const probability = probabilityFor(answer, route);
    const probabilities = answer?.probabilities && typeof answer.probabilities === "object"
      ? { ...answer.probabilities }
      : {};
    const confidence = typeof answer?.confidence === "number" ? answer.confidence : 0;
    const accepted = route !== "current"
      && probability >= ROUTING_POLICY.minProbability
      && confidence >= ROUTING_POLICY.minConfidence;
    const selected = accepted ? ROUTES[route] : ROUTES.current;

    return {
      source: "typesafe",
      route: accepted ? route : "current",
      agent: selected.agent ?? currentAgent,
      model: selected.model ?? currentModel,
      probability,
      probabilities,
      confidence,
      accepted,
      modelUsed: response.model,
      usage: response.usage,
      latencyMs: Math.round(now() - started),
      reason: accepted ? "threshold-met" : "uncertain-or-current",
    };
  } catch (error) {
    return {
      ...routeFallback({
        currentAgent,
        currentModel,
        reason: error instanceof Error ? `typesafe-error:${error.message}` : "typesafe-error",
      }),
      latencyMs: Math.round(now() - started),
    };
  }
}

export function isRoutingEnabled(environment = process.env) {
  return environment.OPENCODE_JEV_ROUTING === "1";
}
