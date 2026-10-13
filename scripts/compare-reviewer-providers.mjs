import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fixtureChange, summarize, validateFixtures } from "./baseline-reviewer-router.mjs";
import { selectReviewers } from "./reviewer-decision-provider.mjs";
import { REVIEWER_NAMES, reviewerRequest } from "./reviewer-request.mjs";

const FIXTURES = new URL("../tests/fixtures/reviewer-provider-comparison.json", import.meta.url);
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function mockResponse(script) {
  if (script.error) throw new Error("Synthetic provider failure");
  if (script.raw) return structuredClone(script.raw);
  return {
    model: script.model,
    answers: Object.fromEntries(REVIEWER_NAMES.map((name, index) => [name, { type: "noul", noul: script.probabilities[index] }])),
    usage: script.usage,
  };
}

async function replay(change, provider, script) {
  if (!Number.isFinite(script?.latencyMs) || script.latencyMs < 0) throw new Error("Missing synthetic timing");
  let clock = 0;
  let requestHash;
  const respond = request => {
    const payload = structuredClone(request);
    delete payload.model;
    requestHash = digest(payload);
    return mockResponse(script);
  };
  const result = await selectReviewers(structuredClone(change), {
    provider, now: () => { const value = clock; clock += script.latencyMs; return value; },
    jevClient: { systemOne: async request => respond(request) },
    subqTransport: async request => ({ status: script.httpStatus ?? 200, body: respond(request.body) }),
  });
  return { requestHash, result };
}

export const ILLUSTRATIVE_RATES = {
  jev: { inputUsdPerMillion: 1, outputUsdPerMillion: 2 },
  subq: { inputUsdPerMillion: 1, outputUsdPerMillion: 0 },
};

function estimatedCost(usage, rates) {
  if (!rates) return null;
  if (![rates.inputUsdPerMillion, rates.outputUsdPerMillion].every(value => Number.isFinite(value) && value >= 0)) {
    throw new Error("Cost rates must be finite nonnegative USD per million tokens");
  }
  return usage.reduce((sum, item) => sum + (item.input_tokens * rates.inputUsdPerMillion + item.output_tokens * rates.outputUsdPerMillion) / 1_000_000, 0);
}

function providerSummary(cases, rates) {
  // Reuse baseline label/dispute scoring; failures remain outside accuracy totals.
  const baseline = summarize(cases.map(item => ({
    fixture: item.fixture, source: item.result.status === "ok" ? "typesafe" : "fallback",
    selected: item.result.selectedReviewers, elapsedMs: item.result.metadata.elapsedMs,
    usage: item.result.metadata.usage,
  })));
  const count = status => cases.filter(item => item.result.status === status).length;
  const invalid = count("invalid");
  const errors = count("error");
  const rate = value => cases.length ? value / cases.length : null;
  const reported = cases.map(item => item.result.metadata.usage).filter(Boolean);
  return {
    attempted: cases.length, completed: baseline.completed,
    invalid, invalidRate: rate(invalid), errors, errorRate: rate(errors),
    fallbacks: baseline.fallback, fallbackRate: rate(baseline.fallback),
    accuracy: { population: "successful synthetic responses only; disputed labels excluded", perReviewer: baseline.perReviewer },
    usage: { reportedCases: reported.length, missingCases: cases.length - reported.length,
      inputTokens: reported.reduce((sum, item) => sum + item.input_tokens, 0),
      outputTokens: reported.reduce((sum, item) => sum + item.output_tokens, 0) },
    costUsd: estimatedCost(reported, rates), costRates: rates ?? null,
    latency: { kind: "injected synthetic milliseconds, not measured service latency", meanMs: baseline.meanLatencyMs },
  };
}

export async function compareProviders(fixtures, rates = ILLUSTRATIVE_RATES) {
  validateFixtures(fixtures);
  if (fixtures.some(fixture => fixture.commit)) throw new Error("Offline comparison accepts synthetic fixtures only");
  const cases = [];
  for (const fixture of fixtures) {
    const change = fixtureChange(fixture);
    const requestHash = digest(reviewerRequest(change));
    for (const provider of ["jev", "subq"]) {
      const replayed = await replay(change, provider, fixture.providers[provider]);
      if (replayed.requestHash !== requestHash) throw new Error("Provider input differs from shared request");
      cases.push({ fixture, provider, ...replayed });
    }
  }
  return {
    mode: "offline-mocked", fixtureHash: digest(fixtures),
    interpretation: "Synthetic adapter/policy tests, not provider quality, calibration, cost, or latency evidence. No provider ranking.",
    confidence: "Only each provider's noul probability of yes is used. Shared thresholds are policy reuse, not evidence of equal calibration; choice/score confidence is rejected.",
    cost: "No live calls or spend. Cost estimates apply explicitly illustrative USD-per-million rates to reported synthetic usage only; missing usage is excluded, not free. These are not provider prices or actual spend. Formula: (input tokens × input rate + output tokens × output rate) / 1,000,000.",
    commonSuccessfulCases: fixtures.filter(fixture => cases.filter(item => item.fixture.id === fixture.id).every(item => item.result.status === "ok")).length,
    providers: Object.fromEntries(["jev", "subq"].map(provider => [provider, providerSummary(cases.filter(item => item.provider === provider), rates[provider])])),
    cases,
  };
}

export function renderComparison(report) {
  const lines = [
    "# Offline reviewer provider comparison", "", report.interpretation, "",
    `Fixture SHA-256: \`${report.fixtureHash}\`. Mode: \`${report.mode}\`.`, "",
    report.confidence, "", report.cost, "",
    "Both adapters receive identical state and six questions; only provider model selection differs. The request digest on each case excludes that model field.", "",
    "| Provider | Completed | Raw invalid | Raw errors | Fallbacks | Reported tokens (in/out) | Usage coverage | Synthetic mean ms | Illustrative cost USD |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...Object.entries(report.providers).map(([name, row]) => `| ${name} | ${row.completed}/${row.attempted} | ${row.invalid}/${row.attempted} | ${row.errors}/${row.attempted} | ${row.fallbacks}/${row.attempted} | ${row.usage.inputTokens}/${row.usage.outputTokens} | ${row.usage.reportedCases}/${row.attempted} | ${row.latency.meanMs} | ${row.costUsd ?? "unavailable"} |`),
    "",
    ...Object.entries(report.providers).map(([name, row]) => `${name} illustrative rates (USD/million input/output tokens): ${row.costRates ? `${row.costRates.inputUsdPerMillion}/${row.costRates.outputUsdPerMillion}` : "unavailable"}.`),
    "",
    `Common successful cases: ${report.commonSuccessfulCases}. Accuracy below uses each provider's successful cases only and excludes disputed labels. Different coverage prevents a fair head-to-head accuracy conclusion. Invalid/error results fall back to manual selection, not another provider; manual selections are not scored.`, "",
    "| Provider | Reviewer | Missed / positive | Unnecessary / negative |",
    "| --- | --- | ---: | ---: |",
    ...Object.entries(report.providers).flatMap(([name, provider]) => Object.entries(provider.accuracy.perReviewer).map(([reviewer, row]) => `| ${name} | ${reviewer} | ${row.missed}/${row.labeledPositive} | ${row.unnecessary}/${row.labeledNegative} |`)),
    "", "| Case | Provider | Status | Input SHA-256 |", "| --- | --- | --- | --- |",
    ...report.cases.map(item => `| ${item.fixture.id} | ${item.provider} | ${item.result.status} | \`${item.requestHash}\` |`),
    "", "Reproduce without credentials or network: `node scripts/compare-reviewer-providers.mjs > docs/reviewer-provider-comparison.md`. All responses, usage, and timings are injected fixtures. No live pilot is implemented or authorized by this report.",
  ];
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error("Offline comparison takes no arguments; live evaluation is not supported");
  process.stdout.write(renderComparison(await compareProviders(JSON.parse(readFileSync(FIXTURES, "utf8")))));
}
