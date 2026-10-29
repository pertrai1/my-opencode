import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import yaml from "js-yaml";
import cases from "../evals/review-risk/cases.mjs";
import prompt, { instructions } from "../evals/review-risk/prompt.mjs";
import grader from "../evals/review-risk/grader.mjs";
import mechanics from "../evals/review-risk/mechanics.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));
const caseDirectory = join(repository, "evals/review-risk");
const read = path => readFileSync(join(repository, path), "utf8");
const examples = yaml.load(read("evals/review-risk/examples.yaml"));
const output = `Review risk (reviewer): R2 + C0 + U0 = 2/6; focused (~10–20 min); override: none.
Scope: supplied synthetic evidence only; exact revisions unresolved.
Evidence: controlled wiring output, not a model assessment.
Impact: no real repository inspected; graph not accessed.
Focus / gaps: live judgment unverified; advisory, not approval.`;

test("model cases reuse evidence but keep candidates and grading notes out of generation", () => {
  const scenarios = cases();
  assert.equal(scenarios.length, 6);
  for (const [index, scenario] of scenarios.entries()) {
    assert.deepEqual(Object.keys(scenario.vars), ["evidence"]);
    assert.deepEqual(scenario.assert.map(assertion => assertion.type), ["llm-rubric"]);
    if (index < examples.length) {
      assert.equal(scenario.vars.evidence, examples[index].vars.evidence);
      assert.equal(scenario.assert[0].value, examples[index].vars.semantic_review);
    }
    const rendered = JSON.stringify(prompt({ vars: {
      ...scenario.vars, candidate: "CANDIDATE_LEAK_SENTINEL", semantic_review: "GRADE_LEAK_SENTINEL",
    } }));
    assert.doesNotMatch(rendered, /CANDIDATE_LEAK_SENTINEL|GRADE_LEAK_SENTINEL/);
  }
  const boundary = scenarios.at(-1);
  assert.match(boundary.assert[0].value, /R2\/C0\/U0 supports focused/);
  assert.match(boundary.assert[0].value, /alone must not force deep/);
  assert.equal(mechanics(output).pass, true);
  assert.equal(mechanics(output.replace("focused", "deep")).pass, false);
});

test("generation and grading load actual canonical rubric and independent review instructions", () => {
  const rubric = read("docs/agents/review-risk.md").trim();
  const command = read("commands/code-review.md");
  const independent = command.split("## Scope and independent risk assessment\n")[1].split("\n## Reviewer selection")[0].trim();
  const messages = prompt({ vars: { evidence: "SCENARIO_EVIDENCE" } });
  assert.ok(instructions().includes(rubric));
  assert.ok(instructions().includes(independent));
  assert.ok(messages.find(message => message.role === "system")?.content.includes(instructions()));
  assert.deepEqual(messages[1], { role: "user", content: "SCENARIO_EVIDENCE" });
  assert.match(messages.find(message => message.role === "system")?.content, /Do not substitute the evaluation checkout/);
  assert.ok(grader().includes(instructions()));
  assert.match(grader(), /mechanically valid but unjustified low score still fails/);
  assert.match(grader(), /Ratings may differ/);
  assert.match(grader(), /Unknown scope requires R2\/U2/);
  assert.match(grader(), /R2 alone requires focused, not automatically deep/);
});

function runCli(t, mechanicalPass, semanticPass) {
  const directory = mkdtempSync(join(tmpdir(), "review-risk-wiring-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = join(directory, "requests.jsonl");
  const report = join(directory, "report.json");
  const provider = join(directory, "provider.cjs");
  writeFileSync(provider, `const { appendFileSync } = require("node:fs");
module.exports = class {
  constructor(options) { this.config = options.config; }
  id() { return "review-risk-offline-wiring"; }
  async callApi(prompt, context) {
    const kind = prompt.startsWith("Grade the candidate") ? "judge" : "candidate";
    appendFileSync(this.config.log, JSON.stringify({ kind, prompt, vars: context.vars }) + "\\n");
    return { output: kind === "judge"
      ? JSON.stringify({ pass: this.config.semanticPass, score: Number(this.config.semanticPass), reason: "Controlled wiring response; no semantic grading performed." })
      : this.config.output };
  }
};`);
  const config = yaml.load(read("evals/review-risk/model.yaml"));
  // Preserve real prompts, cases, both assertions and base path. Replace only
  // the paid provider endpoints; all networking is blocked by the preload.
  const controlled = { id: `file://${provider}`, config: {
    log, semanticPass, output: mechanicalPass ? output : output.replace("2/6", "1/6"),
  } };
  config.providers = [controlled];
  config.defaultTest.options.provider = controlled;
  config.basePath = caseDirectory;
  const path = join(directory, "config.yaml");
  writeFileSync(path, yaml.dump(config));
  const result = spawnSync(process.execPath, [
    "--require", join(repository, "evals/failure-reporting/offline.js"),
    join(repository, "node_modules/promptfoo/dist/src/entrypoint.js"),
    "eval", "-c", path, "--no-cache", "--no-write", "--no-share",
    "--no-progress-bar", "--no-table", "-o", report,
  ], {
    cwd: repository, encoding: "utf8", timeout: 30_000,
    env: { ...process.env, PROMPTFOO_CONFIG_DIR: join(directory, "state"),
      PROMPTFOO_DISABLE_TELEMETRY: "1", PROMPTFOO_DISABLE_UPDATE: "1" },
  });
  assert.equal(result.status, mechanicalPass && semanticPass ? 0 : 100, result.stdout + result.stderr);
  return {
    results: JSON.parse(readFileSync(report, "utf8")).results,
    calls: readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)),
  };
}

for (const [mechanicalPass, semanticPass] of [[true, true], [true, false], [false, true]]) {
  test(`actual Promptfoo CLI combines mechanics=${mechanicalPass} and controlled grader=${semanticPass} offline`, t => {
    const { results, calls } = runCli(t, mechanicalPass, semanticPass);
    assert.equal(results.stats.errors, 0);
    assert.equal(results.results.length, 6);
    assert.equal(results.stats.successes, mechanicalPass && semanticPass ? 6 : 0);
    const candidates = calls.filter(call => call.kind === "candidate");
    const judges = calls.filter(call => call.kind === "judge");
    assert.equal(candidates.length, 6);
    assert.equal(judges.length, 6);
    for (const scenario of cases()) {
      const candidate = candidates.find(call => call.vars.evidence === scenario.vars.evidence);
      const judge = judges.find(call => call.vars.evidence === scenario.vars.evidence);
      assert.ok(candidate);
      assert.ok(judge);
      // Promptfoo adds evaluation IDs/repeat metadata to provider context, but
      // these must stay separate from evidence and the rendered model request.
      assert.deepEqual(Object.keys(candidate.vars).filter(key => !key.startsWith("__")), ["evidence"]);
      assert.ok(!candidate.prompt.includes(candidate.vars.__evalId));
      assert.ok(!candidate.prompt.includes(candidate.vars.__evalStepId));
      const messages = JSON.parse(candidate.prompt);
      assert.ok(messages.find(message => message.role === "system")?.content.includes(instructions()));
      assert.deepEqual(messages[1], { role: "user", content: scenario.vars.evidence });
      assert.ok(judge.prompt.includes(instructions()));
      assert.ok(judge.prompt.includes(`<evidence>\n${scenario.vars.evidence}\n</evidence>`));
      assert.ok(judge.prompt.includes(`<scenario_criteria>\n${scenario.assert[0].value}\n</scenario_criteria>`));
      for (const example of examples) {
        assert.ok(!candidate.prompt.includes(example.vars.candidate.trim()));
        assert.ok(!candidate.prompt.includes(example.vars.semantic_review));
      }
      assert.doesNotMatch(candidate.prompt, /[ab]{40}|file:\/\/|\{\{evidence\}\}/);
      assert.doesNotMatch(judge.prompt, /\{\{(?:evidence|output|rubric)\}\}/);
    }
    for (const row of results.results) {
      assert.equal(row.success, mechanicalPass && semanticPass);
      assert.deepEqual(row.gradingResult.componentResults.map(component => component.pass), [mechanicalPass, semanticPass]);
      assert.ok(judges.some(call => call.prompt.includes(`<candidate>\n${row.response.output}\n</candidate>`)));
    }
  });
}
