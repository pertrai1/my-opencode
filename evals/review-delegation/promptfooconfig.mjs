import { scenarios } from "./scenarios.mjs";

export default {
  description: "Review delegation: reconstructed difit viewer-only regression, simulated tools",
  prompts: ["file://prompt.mjs"],
  providers: [{ id: "file://provider.mjs" }],
  defaultTest: {
    assert: [{ type: "javascript", value: "file://assertion.mjs", metric: "independentReviewDelegation" }],
  },
  tests: Object.keys(scenarios).map(scenario => ({ description: scenario, vars: { scenario } })),
  evaluateOptions: { maxConcurrency: 1, cache: false },
};
