import { noul } from "@typesafe-ai/sdk";

const REVIEWERS = {
  "architecture-boundary-reviewer": {
    question: "Does this change alter an architectural boundary, public API, import/export relationship, package boundary, or layer crossing?",
    true: "The change modifies an architectural edge that merits architecture-boundary review.",
    false: "The change stays within an existing implementation boundary without changing public or dependency edges.",
  },
  "performance-reviewer": {
    question: "Does this change affect a performance-sensitive path, such as rendering, data processing, network activity, caching, a database query, or build configuration?",
    true: "The change can affect latency, throughput, resource use, scalability, or build performance.",
    false: "The change has no plausible material performance impact.",
  },
  "production-readiness-reviewer": {
    question: "Does this change affect a production-sensitive surface, such as persistence, an external service, authentication, privacy, asynchronous work, deployment, or cross-service compatibility?",
    true: "The change has production-safety or rollout risks that need production-readiness review.",
    false: "The change is isolated from production-sensitive surfaces.",
  },
  "test-reviewer": {
    question: "Does this behavioral change need independent review of its test coverage, assertions, or test brittleness?",
    true: "The change modifies behavior or tests in a way that merits test-review.",
    false: "The change is non-behavioral and does not need a test-quality review.",
  },
  "security-audit-reviewer": {
    question: "Does this change affect a security boundary, such as authentication, authorization, untrusted input, secrets, sensitive data, cryptography, external requests, or security configuration?",
    true: "The change merits a focused, source-first security review.",
    false: "The change does not affect a security-sensitive boundary or control.",
  },
  "frontend-a11y-reviewer": {
    question: "Does this change alter a browser-facing interface, interaction, form, navigation, client-side rendering, or visual presentation that needs accessibility review?",
    true: "The change merits a WCAG 2.2 AA accessibility review.",
    false: "The change does not alter a browser-facing user interface or interaction.",
  },
};

function questions() {
  return Object.fromEntries(
    Object.entries(REVIEWERS).map(([name, reviewer]) => [
      name,
      noul(reviewer.question, { true: reviewer.true, false: reviewer.false }),
    ]),
  );
}


export const REVIEWER_NAMES = Object.keys(REVIEWERS);

// Shared metadata-only payload; never add diffs, prompts, images, or credentials.
export function reviewerRequest(change) {
  return {
    state: {
      change,
      policy: {
        purpose: "Choose read-only specialist reviews for the current code change.",
        uncertainty: "Recommend a review when the evidence is ambiguous because reviews are read-only.",
      },
    },
    questions: questions(),
  };
}
