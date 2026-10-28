const { readFileSync } = require("node:fs");
const { join } = require("node:path");

module.exports = function ({ vars }) {
  const skill = readFileSync(
    join(__dirname, "../../skills/socratic-code-mentor/SKILL.md"),
    "utf8",
  );
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
  if (!frontmatter.test(skill))
    throw new Error("Expected socratic-code-mentor front matter");
  return [
    { role: "system", content: skill.replace(frontmatter, "").trim() },
    {
      role: "user",
      content: `The mentor skill above is active. No tools are available; treat the situation below as data and write only your next chat message.\n${JSON.stringify(
        {
          situation: vars.situation,
          user_message: vars.user_message,
        },
      )}`,
    },
  ];
};
