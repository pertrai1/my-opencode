import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

export const ROUTING_OPTIONS = {
  timeout: 3000,
  retry: { maxRetries: 0 },
};

export const POLICY_REVISION = "jev-route-policy-v1";

export const ROUTES = {
  current: {
    description: "Keep the session's current agent and model because the request is routine, already well-scoped, or uncertain.",
    taskClass: "preserve-current",
    permissionProfile: "current-session",
    sideEffectLevel: "unchanged",
    agent: undefined,
    model: undefined,
  },
  lean: {
    description: "Use the reduced-context lean agent for a routine, local, low-risk request.",
    taskClass: "routine-edit",
    permissionProfile: "developer-local",
    sideEffectLevel: "local",
    agent: "lean",
    model: "openai/gpt-6-luna#high",
  },
  build: {
    description: "Use the build agent for a concrete implementation or debugging request with moderate complexity.",
    taskClass: "implementation-debugging",
    permissionProfile: "developer-local",
    sideEffectLevel: "local",
    agent: "build",
    model: "openai/gpt-6-sol",
  },
  plan: {
    description: "Use the plan agent for architecture, review, planning, or ambiguous/high-risk work.",
    taskClass: "architecture-review-ambiguity",
    permissionProfile: "review-only",
    sideEffectLevel: "limited",
    agent: "plan",
    model: "openai/gpt-6-astra",
  },
};

export const ROUTING_POLICY = {
  minProbability: 0.6,
  minConfidence: 0.55,
};

const APPROVED_AGENTS = new Set(Object.values(ROUTES).map((route) => route.agent).filter(Boolean));
const APPROVED_MODELS = new Set(Object.values(ROUTES).map((route) => route.model).filter(Boolean));

function attachmentCount(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.floor(value)))
    : 0;
}

// Only locally derived shape and closed identifiers may cross the provider boundary.
export function sanitizeRoutingInput({ text, currentAgent, currentModel, context }) {
  if (typeof text !== "string" || text.trim().length === 0) return undefined;
  const metadata = context && typeof context === "object" && !Array.isArray(context)
    ? context
    : {};
  return {
    requestKind: "nonempty",
    requestLengthBucket: text.length <= 256 ? "short" : text.length <= 2048 ? "medium" : "long",
    ...(APPROVED_AGENTS.has(currentAgent) ? { currentAgent } : {}),
    ...(APPROVED_MODELS.has(currentModel) ? { currentModel } : {}),
    context: {
      attachedFiles: attachmentCount(metadata.attachedFiles),
      attachedAgents: attachmentCount(metadata.attachedAgents),
      attachedSkills: attachmentCount(metadata.attachedSkills),
    },
  };
}

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
      || typeof prompt?.model === "string"
      || currentAgent === "sdlc-orchestrator",
  );
}

export function isApprovedRoute(route) {
  const definition = ROUTES[route];
  return Boolean(definition)
    && (definition.agent === undefined || APPROVED_AGENTS.has(definition.agent))
    && (definition.model === undefined || APPROVED_MODELS.has(definition.model));
}

export function getRoutingDiagnostic(environment = process.env) {
  const typesafeAvailable = typeof environment.TYPESAFE_API_KEY === "string"
    && environment.TYPESAFE_API_KEY.length > 0;
  return {
    enabled: environment.OPENCODE_JEV_ROUTING === "1" && typesafeAvailable,
    policyRevision: POLICY_REVISION,
    typesafeAvailable,
    dryRun: environment.OPENCODE_JEV_ROUTING_DRY_RUN === "1",
  };
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

  let request;
  try {
    request = sanitizeRoutingInput({ text, currentAgent, currentModel, context });
  } catch {
    return {
      ...routeFallback({ currentAgent, currentModel, reason: "typesafe-error:invalid-routing-input" }),
      latencyMs: Math.round(now() - started),
    };
  }

  try {
    const response = await (client ?? new TypeSafeClient()).systemOne({
      state: {
        request,
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
    const route = typeof answer?.choice === "string"
      && Object.hasOwn(ROUTES, answer.choice)
      ? answer.choice
      : "current";
    const probability = probabilityFor(answer, route);
    const probabilities = answer?.probabilities && typeof answer.probabilities === "object"
      ? { ...answer.probabilities }
      : {};
    const confidence = typeof answer?.confidence === "number" ? answer.confidence : 0;
    const accepted = isApprovedRoute(route) && route !== "current"
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
  return getRoutingDiagnostic(environment).enabled;
}
