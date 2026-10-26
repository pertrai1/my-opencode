import { readFileSync } from "node:fs";

export default function prompt() {
  const paths = [
    "../../AGENTS.md",
    "../../RTK.md",
    "../../docs/agents/style-guide.md",
  ];

  return paths
    .map((path) => readFileSync(new URL(path, import.meta.url), "utf-8"))
    .join("\n\n");
}
