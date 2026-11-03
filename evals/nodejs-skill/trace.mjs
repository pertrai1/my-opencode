export default {
  description: "Node.js skill — real OpenCode activation and reference reads (paid)",
  prompts: ["{{task}}"],
  providers: ["file://trace-provider.mjs"],
  evaluateOptions: { maxConcurrency: 1 },
  defaultTest: { options: { disableVarExpansion: true }, assert: [{ type: "javascript", value: "file://trace-grade.mjs" }] },
  tests: [
    {
      description: "Node CLI loads error, runtime and test guidance",
      vars: {
        fixture: "node",
        task: "Review export.mjs, a Node.js CLI that exports files with streams. Explain why stream failures corrupt JSON stdout and exit successfully, and propose a minimal fix and regression tests. Do not modify files.",
        activate: true,
        references: ["async-and-errors", "runtime-reliability", "testing"],
        forbiddenReferences: ["services-and-production"],
      },
    },
    {
      description: "Browser UI task does not load Node skill",
      vars: {
        fixture: "browser",
        task: "Explain how the browser application's root UI component renders its button label. Do not modify files or review tooling or server code.",
        activate: false,
        references: [],
        forbiddenReferences: ["async-and-errors", "security-and-validation", "testing", "runtime-reliability", "services-and-production"],
      },
    },
  ],
};
