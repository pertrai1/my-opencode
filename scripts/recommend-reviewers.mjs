import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseStatusRecords } from "./git-status.mjs";
import { selectReviewers } from "./reviewer-decision-provider.mjs";

// Keep the existing library interface and default Jev behavior for baseline users.
export async function recommendReviewers(change, client) {
  return selectReviewers(change, { jevClient: client });
}

function gitOutput(args) {
  // Porcelain status columns and path whitespace are data; remove only Git's final LF.
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replace(/\n$/, "");
}

export function changeSummary(files) {
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

function displayPath(path) {
  return /[\s"\\]/u.test(path) ? JSON.stringify(path) : path;
}

export function formatStatus(records) {
  return records.map(({ status, path, originalPath }) =>
    `${status} ${originalPath === undefined ? "" : `${displayPath(originalPath)} -> `}${displayPath(path)}`,
  ).join("\n");
}

export function changeMetadata(getGitOutput = gitOutput) {
  const records = parseStatusRecords(getGitOutput(["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
  return {
    files: formatStatus(records),
    stat: getGitOutput(["diff", "--stat", "HEAD"]),
    summary: changeSummary(records),
  };
}

async function main() {
  try {
    const change = changeMetadata();
    if (!change.files) {
      process.stdout.write(`${JSON.stringify({ source: "none", recommendations: [], selectedReviewers: [] })}\n`);
      return;
    }

    process.stdout.write(`${JSON.stringify(await selectReviewers(change, { provider: process.env.REVIEWER_DECISION_PROVIDER ?? "jev" }))}\n`);
  } catch {
    process.stdout.write(`${JSON.stringify({
      source: "fallback",
      recommendations: [],
      selectedReviewers: [],
      diagnostic: { code: "metadata-error", message: "Unable to collect reviewer routing metadata; use manual selection." },
    })}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
