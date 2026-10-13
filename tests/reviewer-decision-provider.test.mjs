import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DECISION_OPTIONS, selectReviewers, SUBQ_ENDPOINT, SUBQ_MODEL } from "../scripts/reviewer-decision-provider.mjs";
import { REVIEWER_NAMES, reviewerRequest } from "../scripts/reviewer-request.mjs";
import { compareProviders, renderComparison } from "../scripts/compare-reviewer-providers.mjs";

const change = { files: " M src/example.ts", stat: "1 file changed", summary: { fileCount: 1 } };
function response(values = [0, 0.349, 0.35, 0.749, 0.75, 1]) {
  return { model: "fixture", answers: Object.fromEntries(REVIEWER_NAMES.map((name, index) => [name, { type: "noul", noul: values[index] }])) };
}

test("Jev default preserves request, SDK options and selection thresholds", async () => {
  const result = await selectReviewers(change, {
    jevClient: { systemOne: async (request, options) => {
      assert.deepEqual(request, reviewerRequest(change));
      assert.deepEqual(options, DECISION_OPTIONS);
      return response();
    } },
    subqTransport: () => assert.fail("unselected SubQ transport called"),
  });
  assert.equal(result.source, "typesafe");
  assert.equal(result.status, "ok");
  assert.deepEqual(result.recommendations.map(item => item.decision), ["not-selected", "not-selected", "uncertain", "uncertain", "selected", "selected"]);
  assert.deepEqual(result.selectedReviewers, REVIEWER_NAMES.slice(2));
});

test("SubQ uses the official POST contract with identical state and questions", async () => {
  const result = await selectReviewers(change, {
    provider: "subq", jevClient: { systemOne: () => assert.fail("unselected Jev called") },
    subqTransport: async (request, options) => {
      assert.equal(request.method, "POST");
      assert.equal(request.url, SUBQ_ENDPOINT);
      assert.deepEqual(request.body, { ...reviewerRequest(change), model: SUBQ_MODEL });
      assert.deepEqual(options, DECISION_OPTIONS);
      return { status: 200, body: response() };
    },
  });
  assert.equal(result.source, "subq");
  assert.equal(result.status, "ok");
  assert.deepEqual(result.selectedReviewers, REVIEWER_NAMES.slice(2));
});

for (const provider of ["off", "unknown", "subq"]) {
  test(`${provider} cannot call Jev or silently fail over`, async () => {
    const result = await selectReviewers(change, { provider, jevClient: { systemOne: () => assert.fail("Jev called") } });
    assert.equal(result.source, "fallback");
    assert.deepEqual(result.selectedReviewers, []);
    assert.equal(result.diagnostic.code, { off: "disabled", unknown: "unknown-provider", subq: "provider-unavailable" }[provider]);
  });
}

const invalidAnswers = [NaN, Infinity, -0.1, 1.1, "0.9", null];
for (const value of invalidAnswers) {
  test(`invalid probability ${String(value)} falls back without partial selections`, async () => {
    const body = response(); body.answers[REVIEWER_NAMES[5]].noul = value;
    const result = await selectReviewers(change, { jevClient: { systemOne: async () => body } });
    assert.equal(result.status, "invalid");
    assert.deepEqual(result.selectedReviewers, []);
  });
}

test("incomplete, extra and wrong-type answers are invalid, including confidence without noul", async () => {
  const missing = response(); delete missing.answers["architecture-boundary-reviewer"];
  const extra = response(); extra.answers.unapproved = { type: "noul", noul: 1 };
  const choice = response(); choice.answers["architecture-boundary-reviewer"] = { type: "choice", confidence: 0.99, noul: 1 };
  for (const body of [missing, extra, choice, {}, { answers: [] }]) {
    const result = await selectReviewers(change, { provider: "subq", subqTransport: async () => ({ status: 200, body }) });
    assert.equal(result.status, "invalid");
  }
});

test("provider errors and HTTP failures have bounded diagnostics, with no response leakage", async () => {
  const error = await selectReviewers(change, { jevClient: { systemOne: async () => { throw new Error("private fixture payload"); } } });
  assert.equal(error.status, "error");
  assert.doesNotMatch(JSON.stringify(error), /private fixture payload/);
  const http = await selectReviewers(change, { provider: "subq", subqTransport: async () => ({ status: 429, body: { detail: "private fixture payload" } }) });
  assert.equal(http.status, "error");
  assert.doesNotMatch(JSON.stringify(http), /private fixture payload/);
});

test("offline comparison is deterministic, with identical inputs and separate failure/accuracy denominators", async () => {
  const fixtures = JSON.parse(readFileSync(new URL("fixtures/reviewer-provider-comparison.json", import.meta.url), "utf8"));
  const report = await compareProviders(fixtures);
  assert.deepEqual(await compareProviders(fixtures), report);
  for (const fixture of fixtures) {
    const hashes = report.cases.filter(item => item.fixture.id === fixture.id).map(item => item.requestHash);
    assert.equal(new Set(hashes).size, 1);
  }
  assert.equal(report.providers.jev.invalid, 1);
  assert.equal(report.providers.jev.errors, 2);
  assert.equal(report.providers.jev.fallbackRate, 3 / 5);
  assert.equal(report.providers.subq.completed, 3);
  assert.equal(report.commonSuccessfulCases, 2);
  assert.equal(report.providers.subq.accuracy.perReviewer["frontend-a11y-reviewer"].missed, 1);
  assert.equal(report.providers.jev.accuracy.perReviewer["performance-reviewer"].labeledNegative, 1);
  assert.equal(report.providers.jev.costUsd, (report.providers.jev.usage.inputTokens + 2 * report.providers.jev.usage.outputTokens) / 1_000_000);
  assert.equal((await compareProviders(fixtures, {})).providers.jev.costUsd, null);
  await assert.rejects(compareProviders(fixtures, { jev: { inputUsdPerMillion: -1, outputUsdPerMillion: 0 } }), /Cost rates/);
  assert.equal(renderComparison(report), readFileSync(new URL("../docs/reviewer-provider-comparison.md", import.meta.url), "utf8"));
  assert.equal(report.providers.jev.latency.meanMs, 7);
  assert.equal(report.providers.jev.usage.missingCases, 2);
});

test("offline CLI works with an empty environment and rejects live arguments", () => {
  const script = new URL("../scripts/compare-reviewer-providers.mjs", import.meta.url);
  const options = { env: {}, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
  const first = execFileSync(process.execPath, [script.pathname], options);
  assert.equal(execFileSync(process.execPath, [script.pathname], options), first);
  assert.throws(() => execFileSync(process.execPath, [script.pathname, "--live"], options));
});

test("historical replay is rejected before any offline comparison", async () => {
  await assert.rejects(compareProviders([{ id: "history", commit: "abc", expected: [] }]), /synthetic fixtures only/);
});
