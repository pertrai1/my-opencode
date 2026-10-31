import { readFileSync } from "node:fs";
const cases = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8"));

export default {
  description: "Node.js skill synthetic replay — offline wiring only",
  prompts: ["file://prompt.mjs"],
  providers: ["file://replay-provider.mjs"],
  tests: cases.map(scenario => ({
    description: scenario.id,
    vars: { scenario },
    assert: [{ type: "javascript", value: "file://grade.mjs" }],
  })),
};
