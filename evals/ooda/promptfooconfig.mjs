import { scenarios } from "./harness.mjs";

export default {
  description: "OODA: agent-prompt behavior under simulated tools",
  prompts: ["file://prompt.mjs"],
  providers: [{ id: "file://promptfoo-provider.mjs" }],
  defaultTest: {
    vars: { agent: "agents/sdlc-orchestrator.md" },
    assert: [{ type: "javascript", value: "file://assertion.mjs", metric: "evidenceAdaptation" }],
  },
  tests: Object.keys(scenarios).map(scenario => ({ description: scenario, vars: { scenario } })),
  evaluateOptions: { maxConcurrency: 1 },
};
