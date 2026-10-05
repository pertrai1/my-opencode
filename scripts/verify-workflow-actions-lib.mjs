import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const shaPattern = /^[0-9a-f]{40}$/i;
const releaseCommentPattern = /\bv\d+\.\d+\.\d+\b/;
const actionLinePattern = /^\s*(?:-\s+)?uses:\s*([^\s#]+)(?:\s+#\s*(.*))?\s*$/;

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

export function violationsForFile(file, contents) {
  const violations = [];
  for (const [index, line] of contents.split("\n").entries()) {
    const match = line.match(actionLinePattern);
    if (!match || match[1].startsWith("./") || match[1].startsWith("docker://")) {
      continue;
    }

    const [action, reference] = match[1].split("@");
    if (!action.includes("/") || !shaPattern.test(reference ?? "") || !releaseCommentPattern.test(match[2] ?? "")) {
      violations.push({ file, line: index + 1, text: line.trim() });
    }
  }
  return violations;
}

export async function verifyWorkflowActions({ workflowsDirectory = ".github/workflows" } = {}) {
  const violations = [];
  for (const file of await workflowFiles(workflowsDirectory)) {
    const contents = await readFile(file, "utf8");
    violations.push(...violationsForFile(file, contents));
  }
  return { violations };
}

