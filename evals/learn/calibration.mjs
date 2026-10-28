import benchmark from "./benchmark.mjs";

// Synthetic grader calibration only. Native echo makes no model requests.
// These local transforms manufacture outputs from labels AFTER prompt rendering;
// they must never be used in the real-model benchmark.
export default {
  ...benchmark,
  description: "SYNTHETIC learn calibration: baseline 7/10, candidate 10/10; no model called",
  providers: [
    {
      id: "echo",
      label: "synthetic-baseline",
      transform: (_output, { vars }) => JSON.stringify({
        ...vars.expected,
        ...["failed-attempt", "inherited-paraphrase", "stale-contradiction"].includes(vars.id)
          ? { decision: "retain" } : {},
      }),
    },
    {
      id: "echo",
      label: "synthetic-candidate",
      transform: (_output, { vars }) => JSON.stringify(vars.expected),
    },
  ],
};
