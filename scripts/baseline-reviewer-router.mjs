import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { changeSummary, recommendReviewers } from "./recommend-reviewers.mjs";

const FIXTURES = new URL("../tests/fixtures/reviewer-router-baseline.json", import.meta.url);
const REVIEWERS = [
  "architecture-boundary-reviewer", "performance-reviewer", "production-readiness-reviewer",
  "test-reviewer", "security-audit-reviewer", "frontend-a11y-reviewer",
];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

export function fixtureChange(fixture, runGit = git) {
  let files;
  let stat;
  if (fixture.commit) {
    files = runGit(["diff-tree", "--no-commit-id", "--name-status", "--no-renames", "-r", fixture.commit])
      .split("\n").filter(Boolean)
      .map((entry) => {
        const [status, path] = entry.split("\t");
        if (!/^[AMDT]$/.test(status) || !path) throw new Error(`Unsupported historical file status: ${entry}`);
        return `${status === "A" ? "A " : ` ${status}`} ${path}`;
      }).join("\n");
    stat = runGit(["show", "--format=", "--stat", "--no-renames", fixture.commit]);
  } else {
    files = fixture.synthetic.files;
    stat = fixture.synthetic.stat;
  }
  if (!files) throw new Error(`No files in fixture ${fixture.id}`);
  return { files, stat, summary: changeSummary(files) };
}

function validateFixtures(fixtures) {
  const ids = new Set();
  for (const fixture of fixtures) {
    if (!fixture.id || ids.has(fixture.id) || Boolean(fixture.commit) === Boolean(fixture.synthetic)) {
      throw new Error(`Invalid fixture identity or source: ${fixture.id}`);
    }
    ids.add(fixture.id);
    if (!Array.isArray(fixture.expected) || !Array.isArray(fixture.disputed ?? [])) {
      throw new Error(`Missing reviewer labels: ${fixture.id}`);
    }
    const labels = [...fixture.expected, ...(fixture.disputed ?? [])];
    if (new Set(labels).size !== labels.length || labels.some((label) => !REVIEWERS.includes(label))) {
      throw new Error(`Unknown or duplicate reviewer label: ${fixture.id}`);
    }
  }
}

export async function evaluate(fixtures, { runGit = git, route = recommendReviewers, makeClient = () => new TypeSafeClient(), now = () => performance.now() } = {}) {
  validateFixtures(fixtures);
  const cases = [];
  for (const fixture of fixtures) {
    const change = fixtureChange(fixture, runGit);
    const caseResult = { fixture, change, source: "fallback", elapsedMs: null, model: null, usage: null, questionHash: null, selected: [], error: null };
    const started = now();
    try {
      const client = {
        async systemOne(request, options) {
          caseResult.questionHash = createHash("sha256").update(JSON.stringify(request.questions)).digest("hex");
          const response = await makeClient().systemOne(request, options);
          caseResult.model = response.model ?? null;
          caseResult.usage = response.usage ?? null;
          return response;
        },
      };
      const result = await route(change, client);
      if (result.source !== "typesafe" || !Array.isArray(result.selectedReviewers)
        || result.selectedReviewers.some((reviewer) => !REVIEWERS.includes(reviewer))) {
        throw new Error("Invalid router response");
      }
      caseResult.source = "typesafe";
      caseResult.selected = result.selectedReviewers;
    } catch (error) {
      caseResult.error = error instanceof Error ? error.message : "Unknown routing failure";
    }
    caseResult.elapsedMs = Math.round(now() - started);
    cases.push(caseResult);
  }
  return cases;
}

export function summarize(cases) {
  const perReviewer = Object.fromEntries(REVIEWERS.map((reviewer) => [reviewer, { missed: 0, unnecessary: 0, labeledPositive: 0, labeledNegative: 0 }]));
  const completed = cases.filter((item) => item.source === "typesafe");
  const fallback = cases.length - completed.length;
  for (const item of completed) {
    const selected = new Set(item.selected);
    const expected = new Set(item.fixture.expected);
    const disputed = new Set(item.fixture.disputed ?? []);
    for (const reviewer of REVIEWERS) {
      if (disputed.has(reviewer)) continue;
      const tally = perReviewer[reviewer];
      if (expected.has(reviewer)) {
        tally.labeledPositive++;
        if (!selected.has(reviewer)) tally.missed++;
      } else {
        tally.labeledNegative++;
        if (selected.has(reviewer)) tally.unnecessary++;
      }
    }
  }
  const usage = completed.map((item) => item.usage);
  const tokenTotals = usage.length > 0 && usage.every((item) => Number.isFinite(item?.input_tokens) && Number.isFinite(item?.output_tokens))
    ? { input: usage.reduce((total, item) => total + item.input_tokens, 0), output: usage.reduce((total, item) => total + item.output_tokens, 0) }
    : null;
  return {
    perReviewer, fallback, completed: completed.length,
    meanLatencyMs: cases.length ? Math.round(cases.reduce((sum, item) => sum + item.elapsedMs, 0) / cases.length) : null,
    tokenTotals,
  };
}

export function render(cases) {
  const summary = summarize(cases);
  const digest = createHash("sha256").update(JSON.stringify(cases.map(({ fixture }) => fixture))).digest("hex");
  const display = (values) => values.length ? values.join(", ") : "none";
  const questionHashes = [...new Set(cases.map((item) => item.questionHash).filter(Boolean))].map((hash) => `\`${hash}\``);
  const models = [...new Set(cases.map((item) => item.model).filter(Boolean))];
  const estimatedCost = summary.tokenTotals && models.length === 1 && models.includes("jev-1.13.0")
    ? `$${(summary.tokenTotals.input * 0.042 / 1_000_000).toFixed(6)}`
    : "unavailable";
  const lines = [
    "# Reviewer router baseline",
    "",
    "The current metadata-only router was replayed against independently labeled historical commits and explicitly synthetic scenarios. Labels were assigned from the change descriptions and historical diffs before router predictions were recorded. Synthetic scenarios are coverage probes, not observed changes. This small set is diagnostic, not an accuracy estimate for other repositories.",
    "",
    `Fixture SHA-256: \`${digest}\`. Each historical case is addressed by its full commit hash; replay derives file status, diff statistics, and summary using the router's current metadata shape. No raw diff is sent to TypeSafe.`,
    `Routing questions SHA-256: ${questionHashes.length ? questionHashes.join(", ") : "unavailable"}.`,
    `Policy: select at ≥0.75; include uncertain at ≥0.35 (effective launch threshold 0.35); 3 s timeout, no retries. Models observed: ${models.length ? models.join(", ") : "unavailable"}.`,
    "",
    `Completed TypeSafe calls: ${summary.completed}/${cases.length}. Fallbacks: ${summary.fallback}/${cases.length}. Mean end-to-end time: ${summary.meanLatencyMs ?? "unavailable"} ms per case (includes failures). Tokens: ${summary.tokenTotals ? `${summary.tokenTotals.input} input, ${summary.tokenTotals.output} output` : "unavailable (not reported on every successful call)"}.`,
    `Estimated TypeSafe input charge: ${estimatedCost} at the [published jev-1.13.0 rate](https://docs.typesafe.ai/models) of $0.042 per million input tokens (output tokens free); excludes specialist-review costs.`,
    "",
    "| Reviewer | Missed / positive | Unnecessary / negative |",
    "| --- | ---: | ---: |",
    ...REVIEWERS.map((reviewer) => {
      const row = summary.perReviewer[reviewer];
      return `| ${reviewer} | ${row.missed}/${row.labeledPositive} | ${row.unnecessary}/${row.labeledNegative} |`;
    }),
    "",
    "Disputed reviewer labels are excluded from their corresponding denominators. Fallback cases have no predictions and are excluded from all accuracy denominators; the /code-review command would apply its manual rules in that situation. A zero denominator means this fixture set cannot assess that category.",
    "",
    "| Case | Kind | Expected | Disputed | Selected | Time (ms) | Status |",
    "| --- | --- | --- | --- | --- | ---: | --- |",
    ...cases.map(({ fixture, selected, source, elapsedMs, error }) => `| ${fixture.id} | ${fixture.commit ? `commit \`${fixture.commit.slice(0, 7)}\`` : "synthetic"} | ${display(fixture.expected)} | ${display(fixture.disputed ?? [])} | ${source === "typesafe" ? display(selected) : "n/a"} | ${elapsedMs} | ${source}${error ? ` (${error.replaceAll("|", "\\|").replaceAll("\n", " ")})` : ""} |`),
    "",
    "## Label rationale",
    "",
    ...cases.map(({ fixture }) => `- **${fixture.id}:** ${fixture.reason}`),
    "",
    "## Recommendation",
    "",
    summary.completed === 0
      ? "No live predictions were available. Run with TYPESAFE_API_KEY in the environment before drawing routing conclusions."
      : "Inspect the misses and unnecessary selections above before changing routing policy. Validate on additional labeled changes from target repositories, especially real browser-facing work, before tuning reviewer-specific thresholds or expanding metadata sent to TypeSafe.",
    "",
    "Reproduce from this repository: `node scripts/baseline-reviewer-router.mjs > docs/reviewer-router-baseline.md`. The output is a snapshot; reruns can change with the model alias, service conditions, or the question definitions. Use the recorded commit hashes, fixture digest, question digest, and resolved model when comparing runs. Review label changes before comparing new runs to this snapshot.",
  ];
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixtures = JSON.parse(readFileSync(FIXTURES, "utf8"));
  process.stdout.write(render(await evaluate(fixtures)));
}
