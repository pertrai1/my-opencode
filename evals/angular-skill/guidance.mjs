import { readFileSync } from "node:fs";

const cases = JSON.parse(readFileSync(new URL("./guidance-cases.json", import.meta.url), "utf8"));

export default {
  description: "Angular guidance evaluation — paid model and judge calls, explicit opt-in",
  prompts: ["file://guidance-prompt.mjs"],
  providers: ["openai:gpt-6.1-sol"],
  defaultTest: {
    options: { provider: "openai:gpt-6.1-sol" },
  },
  evaluateOptions: { maxConcurrency: 1 },
  tests: cases.map(scenario => ({
    description: scenario.id,
    vars: { task: scenario.task },
    assert: [{ type: "llm-rubric", value: scenario.rubric }],
  })),
};
