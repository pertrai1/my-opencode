import { readFileSync, readdirSync } from "node:fs";

export default function prompt({ vars }) {
  const root = new URL("../../skills/angular/", import.meta.url);
  const references = readdirSync(new URL("references/", root))
    .filter(name => name.endsWith(".md"))
    .sort()
    .map(name => `Reference: ${name}\n${readFileSync(new URL(`references/${name}`, root), "utf8")}`);
  return `Use the following Angular skill and references to answer the task.
Give a concrete, minimal recommendation with relevant version limits, risks and tests.
Do not perform changes or assume an upgrade is authorized.

${readFileSync(new URL("SKILL.md", root), "utf8")}
${references.join("\n\n")}

Task:
${vars.task}`;
}
