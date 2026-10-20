const { appendFileSync } = require("node:fs");

// Test double only: captures requests without generating or grading an answer.
module.exports = class WiringProvider {
  id() { return "offline-wiring-capture"; }

  async callApi(prompt, context) {
    const kind = prompt.startsWith("Grade the candidate") ? "judge" : "candidate";
    appendFileSync(process.env.PROMPTFOO_CAPTURE_LOG,
      JSON.stringify({ kind, prompt, vars: context?.vars }) + "\n");
    return {
      output: kind === "judge"
        ? JSON.stringify({ pass: false, score: 0, reason: "Offline wiring stub; no semantic grading performed." })
        : "OFFLINE CANDIDATE PLACEHOLDER; no model was called.",
    };
  }
};
