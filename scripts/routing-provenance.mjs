const ROUTING_PROVENANCE_KEYS = [
  "version", "event", "sessionId", "timestamp", "source", "currentAgent",
  "currentModel", "selectedRoute", "selectedAgent", "selectedModel", "confidence",
  "probability", "latencyMs", "accepted", "reason", "fallback",
  "explicitSelectionBypass", "requestDigest",
];

function sourceFor(decision) {
  if (decision?.source === "explicit") return "explicit";
  if (decision?.source === "fallback") return "fallback";
  return "jev";
}

export function createRoutingProvenance({
  sessionId,
  timestamp,
  currentAgent,
  currentModel,
  decision = {},
  explicitSelectionBypass = false,
}) {
  const source = sourceFor(decision);
  const reason = source === "fallback" && decision.reason?.startsWith("typesafe-error")
    ? "typesafe-error"
    : decision.reason ?? "unknown";
  const record = {
    version: 1,
    event: "routing.decision",
    sessionId,
    timestamp,
    source,
    currentAgent,
    currentModel,
    selectedRoute: decision.route ?? "current",
    selectedAgent: decision.agent ?? currentAgent,
    selectedModel: decision.model ?? currentModel,
    confidence: decision.confidence,
    probability: decision.probability,
    latencyMs: decision.latencyMs,
    accepted: Boolean(decision.accepted),
    reason,
    fallback: source === "fallback",
    explicitSelectionBypass: Boolean(explicitSelectionBypass),
    requestDigest: decision.requestDigest,
  };

  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

export async function emitRoutingProvenance(record, sink, { enabled = false } = {}) {
  if (!enabled || typeof sink !== "function") return;
  try {
    await sink(Object.fromEntries(
      Object.entries(record).filter(([key]) => ROUTING_PROVENANCE_KEYS.includes(key)),
    ));
  } catch {
    // Provenance is observability only and must never affect routing.
    return;
  }
}
