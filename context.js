const { readFileSync } = require("node:fs");
const { join } = require("node:path");

// Promptfoo dynamic variable: local synthetic evidence, with no network access.
module.exports = function () {
  return {
    output: readFileSync(
      join(__dirname, "evals/failure-reporting/evidence.txt"),
      "utf8",
    ),
  };
};
