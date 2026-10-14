import { TypeSafeClient } from "@typesafe-ai/sdk";
import { REVIEWER_NAMES, reviewerRequest } from "./reviewer-request.mjs";

export const DECISION_OPTIONS = { timeout: 3000, retry: { maxRetries: 0 } };
export const SUBQ_ENDPOINT = "https://api.subq.ai/v1/systemone";
export const SUBQ_MODEL = "subq-snap-preview";

/**
 * Shared request: { state: { change, policy }, questions: named noul questions }.
 * Shared result: provider, status (ok/invalid/error/off), source, recommendations,
 * selectedReviewers, diagnostic, and metadata (model, native usage, elapsedMs).
 * Only noul's probability-of-yes is used; choice/score confidence is not accepted.
 */
class DecisionError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export async function jevDecision(request, client) {
  return (client ?? new TypeSafeClient()).systemOne(request, structuredClone(DECISION_OPTIONS));
}

// No fetch, key lookup, or authentication setup: an approved transport is required.
// Transport resolves { status, body } and must enforce timeout/no-retry options.
export async function subqDecision(request, transport) {
  if (!transport) throw new DecisionError("provider-unavailable");
  const response = await transport({
    method: "POST", url: SUBQ_ENDPOINT, body: { ...request, model: SUBQ_MODEL },
  }, structuredClone(DECISION_OPTIONS));
  if (!Number.isInteger(response?.status)) throw new DecisionError("invalid-response");
  if (response.status < 200 || response.status >= 300) throw new DecisionError("provider-error");
  return response.body;
}

function answerType(answer, provider) {
  // Older injected SDK clients omitted type; retain that existing Jev interface.
  const allowedTypes = provider === "jev" ? ["noul", undefined] : ["noul"];
  if (!answer) throw new DecisionError("invalid-response");
  if (!allowedTypes.includes(answer.type)) throw new DecisionError("invalid-response");
}

function probability(answer, provider) {
  answerType(answer, provider);
  const value = answer.noul;
  if (!Number.isFinite(value)) throw new DecisionError("invalid-response");
  if (value < 0 || value > 1) throw new DecisionError("invalid-response");
  return value;
}

function decision(value) {
  if (value >= 0.75) return "selected";
  if (value >= 0.35) return "uncertain";
  return "not-selected";
}

function recommendations(response, provider) {
  const keys = Object.keys(response?.answers ?? {});
  if (keys.length !== REVIEWER_NAMES.length) throw new DecisionError("invalid-response");
  if (keys.some(key => !REVIEWER_NAMES.includes(key))) throw new DecisionError("invalid-response");
  return REVIEWER_NAMES.map(reviewer => {
    const value = probability(response.answers[reviewer], provider);
    return { reviewer, probability: value, decision: decision(value) };
  });
}

function reportedUsage(response) {
  const usage = response?.usage;
  const validTokens = [usage?.input_tokens, usage?.output_tokens].every(value => Number.isFinite(value) && value >= 0);
  return validTokens ? { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens } : null;
}

function metadata(response, elapsedMs) {
  return {
    model: typeof response?.model === "string" ? response.model : null,
    usage: reportedUsage(response),
    probabilityKind: "noul-probability-of-yes", elapsedMs,
  };
}

function selectedReviewers(items) {
  return items.filter(item => item.decision !== "not-selected").map(item => item.reviewer);
}

function success(provider, response, started, now) {
  const items = recommendations(response, provider);
  return {
    source: provider === "jev" ? "typesafe" : "subq", provider, status: "ok",
    recommendations: items, selectedReviewers: selectedReviewers(items),
    diagnostic: null, metadata: metadata(response, Math.round(now() - started)),
  };
}

function fallback(provider, code, response, elapsedMs) {
  return {
    source: "fallback", provider,
    status: code === "invalid-response" ? "invalid" : "error",
    recommendations: [], selectedReviewers: [],
    diagnostic: { code, message: "Reviewer decision unavailable; use the existing manual selection rules." },
    metadata: metadata(response, elapsedMs),
  };
}

export async function selectReviewers(change, {
  provider = "jev", jevClient, subqTransport, now = () => performance.now(),
} = {}) {
  if (provider === "off") return { ...fallback(provider, "disabled", null, 0), status: "off" };
  if (!["jev", "subq"].includes(provider)) return fallback(provider, "unknown-provider", null, 0);
  const started = now();
  let response;
  try {
    const request = reviewerRequest(change);
    response = provider === "jev" ? await jevDecision(request, jevClient) : await subqDecision(request, subqTransport);
    return success(provider, response, started, now);
  } catch (error) {
    const code = error instanceof DecisionError ? error.code : "provider-error";
    return fallback(provider, code, response, Math.round(now() - started));
  }
}
