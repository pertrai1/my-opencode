import { readFileSync } from "node:fs";
const cases = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8"));
const plans = JSON.parse(readFileSync(new URL("./synthetic-plans.json", import.meta.url), "utf8"));
const api = cases.find(item => item.id === "api-rejection");
const cliCase = cases.find(item => item.id === "cli-output");
const browserCase = cases.find(item => item.id === "browser-angular");
const good = plans[api.id];
const cli = plans[cliCase.id];
const browser = plans[browserCase.id];
const samples = [
  [api, good, true],
  [api, { ...good, activate: false }, false],
  [api, { ...good, actions: [] }, false],
  [api, { ...good, actions: [...good.actions, "terminate-host-process", 42] }, false],
  [api, { ...good, migrations: ["Switch to ESM"] }, false],
  [cliCase, { ...cli, references: [...cli.references, "services-and-production"] }, false],
  [browserCase, { ...browser, activate: true }, false],
  [browserCase, { ...browser, references: ["services-and-production"] }, false],
  [api, { ...good, references: ["testing", "testing"] }, false],
  [api, "malformed", false],
];

export default {
  description: "Node.js grader calibration — all expected verdicts should pass",
  prompts: ["{{candidate}}"],
  providers: ["echo"],
  tests: samples.map(([scenario, candidate, expected], index) => ({
    description: `calibration ${index}: expected ${expected}`,
    vars: { scenario, candidate: JSON.stringify(candidate), expected },
    assert: [{ type: "javascript", value: "file://calibration-grade.mjs" }],
  })),
};
