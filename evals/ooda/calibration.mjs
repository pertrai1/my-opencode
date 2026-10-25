import config from "./promptfooconfig.mjs";

export default {
  ...config,
  description: "OODA grader calibration ONLY: six passes, six failures, six transport errors expected",
  providers: ["pass", "fail", "error"].map(mode => ({
    id: "file://../../tests/fixtures/ooda-calibration-provider.mjs",
    label: `calibration-${mode}`,
    config: { mode },
  })),
};
