import config from "./promptfooconfig.mjs";

export default {
  ...config,
  description:
    "Review-delegation grader calibration ONLY: 5 passes, 5 failures, 5 transport errors expected",
  providers: ["pass", "fail", "error"].map((mode) => ({
    id: "file://../../tests/fixtures/review-delegation-provider.mjs",
    label: `review-calibration-${mode}`,
    config: { mode },
  })),
};
