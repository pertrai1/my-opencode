import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const shaPattern = /^[0-9a-f]{40}$/i;
const releaseCommentPattern = /\bv\d+\.\d+\.\d+\b/;
const usesFieldPattern = /^\s*(?:-\s+)?uses:\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))(?:\s+#\s*(.*))?\s*$/;
const blockScalarPattern = /^\s*(?:-\s+)?[^:#]+:\s*[|>][+-]?\d*\s*(?:#.*)?$/;

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
  let blockScalarIndent = null;
  for (const [index, line] of contents.split("\n").entries()) {
    const indentation = line.match(/^\s*/)[0].length;
    if (blockScalarIndent !== null) {
      if (line.trim() === "" || indentation > blockScalarIndent) {
        continue;
      }
      blockScalarIndent = null;
    }
    if (blockScalarPattern.test(line)) {
      blockScalarIndent = indentation;
      continue;
    }

    const match = line.match(usesFieldPattern);
    if (!match) {
      continue;
    }
    const referenceText = match[1] ?? match[2] ?? match[3];
    if (referenceText.startsWith("./") || referenceText.startsWith("docker://")) {
      continue;
    }

    const [action, reference] = referenceText.split("@");
    if (!action.includes("/") || !shaPattern.test(reference ?? "") || !releaseCommentPattern.test(match[4] ?? "")) {
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
