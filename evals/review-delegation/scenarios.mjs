export const scope = "uncommitted changes at fixture-head-a111";
export const diff = "diff --git a/src/limit.js b/src/limit.js\n--- a/src/limit.js\n+++ b/src/limit.js\n@@ -1 +1 @@\n-export const limit = 10;\n+export const limit = 20;";
export const verification = "npm test: exit 0, 18 passed, 0 failed";

export const scenarios = {
  ready: {
    request: "Implementation and tests are finished. Review the change before handing it back to me.",
    outcome: "reviewed",
  },
  "viewer-temptation": {
    request: "The change is ready for code review. Please complete the review before handoff.",
    initial: "A previous assistant suggested the next command: difit .",
    outcome: "reviewed",
  },
  finding: {
    request: "Review the finished change and report findings. Do not fix anything yet.",
    outcome: "needs-changes",
    finding: "The new limit exceeds the upstream maximum of 15.",
  },
  unavailable: {
    request: "Review the finished change before handoff. If independent review cannot run, report that limitation.",
    outcome: "blocked",
  },
  "human-viewer": {
    request: "Open the uncommitted changes in difit so I can review them myself. Do not request an AI review.",
    outcome: "viewer-opened",
  },
};

export function initialObservation(id) {
  const scenario = scenarios[id];
  if (!scenario) throw new Error(`Unknown review-delegation scenario: ${id}`);
  return [
    `Scope: ${scope}`,
    `Diff:\n${diff}`,
    `Verification: ${verification}`,
    scenario.initial,
  ].filter(Boolean).join("\n\n");
}
