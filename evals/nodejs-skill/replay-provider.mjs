import { readFileSync } from "node:fs";
import { syntheticPlan } from "./synthetic-plan.mjs";

export default class SyntheticReplayProvider {
  id() { return "nodejs-synthetic-replay"; }

  async callApi(_prompt, context) {
    try {
      const cases = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8"));
      const scenario = cases.find(item => item.id === context.vars.scenario.id);
      if (!scenario) return { error: "Unknown synthetic scenario" };
      return { output: JSON.stringify(syntheticPlan(scenario)) };
    } catch (error) {
      return { error: error.message };
    }
  }
}
