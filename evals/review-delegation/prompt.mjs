import { readFileSync } from "node:fs";

export default function prompt() {
  const instructions = ["AGENTS.md", "RTK.md", "docs/agents/style-guide.md"]
    .map(path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));
  const skills = ["difit", "difit-review"].map(id => {
    const body = readFileSync(new URL(`../../.agents/skills/${id}/SKILL.md`, import.meta.url), "utf8");
    return `${id}: ${body.match(/^description: (.+)$/m)?.[1] ?? "No description"}`;
  });
  return [
    "Build-role repository-instructions simulation. The full OpenCode built-in build prompt is not loaded.",
    ...instructions,
    `Available skills (load full instructions through skill):\n${skills.join("\n")}`,
  ].join("\n\n");
}
