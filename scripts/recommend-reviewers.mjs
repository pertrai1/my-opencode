import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { noul, TypeSafeClient } from "@typesafe-ai/sdk";

const SELECT_THRESHOLD = 0.75;
const UNCERTAIN_THRESHOLD = 0.35;
const ROUTING_OPTIONS = {
  timeout: 3000,
  retry: { maxRetries: 0 },
};

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
};

function questions() {
  return Object.fromEntries(
    Object.entries(REVIEWERS).map(([name, reviewer]) => [
      name,
      noul(reviewer.question, { true: reviewer.true, false: reviewer.false }),
    ]),
  );
}

function reviewDecision(probability) {
  if (probability >= SELECT_THRESHOLD) return "selected";
  if (probability >= UNCERTAIN_THRESHOLD) return "uncertain";
  return "not-selected";
}

export async function recommendReviewers(change, client = new TypeSafeClient()) {
  const response = await client.systemOne({
    state: {
      change,
      policy: {
        purpose: "Choose read-only specialist reviews for the current code change.",
        uncertainty: "Recommend a review when the evidence is ambiguous because reviews are read-only.",
      },
    },
    questions: questions(),
  }, ROUTING_OPTIONS);

  const recommendations = Object.keys(REVIEWERS).map((reviewer) => {
    const probability = response.answers[reviewer].noul;
    return { reviewer, probability, decision: reviewDecision(probability) };
  });

  return {
    source: "typesafe",
    recommendations,
    selectedReviewers: recommendations
      .filter(({ decision }) => decision !== "not-selected")
      .map(({ reviewer }) => reviewer),
  };
}

function gitOutput(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function changeSummary(status) {
  const files = status.split("\n").filter(Boolean).map((entry) => ({
    status: entry.slice(0, 2),
    path: entry.slice(3),
  }));
  const paths = files.map(({ path }) => path);
  const extensions = {};

  for (const path of paths) {
    const extension = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "none";
    extensions[extension] = (extensions[extension] ?? 0) + 1;
  }

  return {
    fileCount: files.length,
    newFileCount: files.filter(({ status }) => status === "??" || status.includes("A")).length,
    testFiles: paths.filter((path) => /(^|\/)(test|tests|__tests__)(\/|$)|\.(test|spec)\.[^.]+$/i.test(path)).length,
    scriptFiles: paths.filter((path) => /(^|\/)scripts\//.test(path)).length,
    dependencyFiles: paths.filter((path) => /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(path)).length,
    workflowFiles: paths.filter((path) => /(^|\/)(commands\/|\.github\/workflows\/)/.test(path)).length,
    extensions,
  };
}

export function changeMetadata(getGitOutput = gitOutput) {
  const files = getGitOutput(["status", "--porcelain=v1", "--untracked-files=all"]);
  return {
    files,
    stat: getGitOutput(["diff", "--stat", "HEAD"]),
    summary: changeSummary(files),
  };
}

async function main() {
  try {
    const change = changeMetadata();
    if (!change.files) {
      process.stdout.write(`${JSON.stringify({ source: "none", recommendations: [], selectedReviewers: [] })}\n`);
      return;
    }

    process.stdout.write(`${JSON.stringify(await recommendReviewers(change))}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      source: "fallback",
      recommendations: [],
      selectedReviewers: [],
      error: error instanceof Error ? error.message : "TypeSafe reviewer routing failed",
    })}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
