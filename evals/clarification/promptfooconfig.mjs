import { cases } from "./cases.mjs";

export default {
  description: "Clarification: repository-instructions baseline",

  prompts: ["file://prompt.mjs"],

  providers: [
    {
      id: "file://provider.mjs",
      config: {
        model: "gpt-6-astra",
        reasoningEffort: "high",
      },
    },
  ],

  tests: cases.map(({ id }) => ({
    description: id,
    vars: { scenario: id },
  })),

  defaultTest: {
    assert: [
      {
        type: "javascript",
        value: "file://assertion.mjs",
        metric: "clarificationMechanics",
      },
    ],
  },

  evaluateOptions: {
    maxConcurrency: 1,
    repeat: 3,
    cache: false,
  },
};
