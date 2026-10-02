import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const workflowsDirectory = ".github/workflows";
const shaPattern = /^[0-9a-f]{40}$/i;
const releaseCommentPattern = /\bv\d+\.\d+\.\d+\b/;

async function workflowFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await workflowFiles(path)));
    } else if (/\.ya?ml$/i.test(entry.name)) {
      files.push(path);
    }
  }

  return files;
}

const violations = [];
for (const file of await workflowFiles(workflowsDirectory)) {
  const contents = await readFile(file, "utf8");
  for (const [index, line] of contents.split("\n").entries()) {
    const match = line.match(/^\s*uses:\s*([^\s#]+)(?:\s+#\s*(.*))?\s*$/);
    if (!match || match[1].startsWith("./") || match[1].startsWith("docker://")) {
      continue;
    }

    const [action, reference] = match[1].split("@");
    if (!action.includes("/") || !shaPattern.test(reference ?? "") || !releaseCommentPattern.test(match[2] ?? "")) {
      violations.push(`${file}:${index + 1}: ${line.trim()}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Workflow action references must use a full commit SHA and a release comment:");
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("All third-party workflow actions use full commit SHAs with release comments.");
}
