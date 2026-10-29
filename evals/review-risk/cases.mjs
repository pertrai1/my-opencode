import { readFileSync } from "node:fs";
import yaml from "js-yaml";

export default function cases() {
  const examples = yaml.load(readFileSync(new URL("./examples.yaml", import.meta.url), "utf8"));
  const scenarios = examples.map(({ description, vars: { evidence, semantic_review } }) => ({
    description, evidence, criteria: semantic_review,
  }));
  scenarios.push({
    description: "Shared display label: R2 alone requires focused review",
    evidence: "Full diff changes an exported display-only attribution string in lib/labels.mjs consumed by eight plugins. Direct import and caller inspection establishes all eight consumers; none parse this string or use it for control flow. Snapshot and integration checks for every consumer confirm only attribution text changes. Incorrect attribution has negligible behavioral effect. Graph unavailable; direct source and configuration inspection fully establishes the consumers and behavior, with no remaining consumer or verification gaps.",
    criteria: "R2/C0/U0 supports focused review at 2/6, with no override. Shared reach alone must not force deep review; a missing graph alone does not create uncertainty when direct source inspection establishes all consumers. Reject invented serious harm or missing verification to justify escalation. Allow other ratings only with a concrete rationale supported by this evidence and the canonical rubric.",
  });
  return scenarios.map(({ description, evidence, criteria }) => ({
    description,
    // Generation receives evidence only. Candidate answers are never loaded into
    // vars; semantic notes are assertion criteria, available only to the grader.
    vars: { evidence },
    assert: [{ type: "llm-rubric", threshold: 1, value: criteria }],
  }));
}
