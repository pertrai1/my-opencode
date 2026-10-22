const { readFileSync } = require("node:fs");
const { join } = require("node:path");

module.exports = function ({ vars }) {
  const agent = readFileSync(
    join(__dirname, "../../agents/change-verifier.md"),
    "utf8",
  );
  const frontMatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
  if (!frontMatter.test(agent)) {
    throw new Error("Expected change-verifier YAML front matter");
  }
  return [
    { role: "system", content: agent.replace(frontMatter, "").trim() },
    { role: "user", content: vars.evidence },
  ];
};
