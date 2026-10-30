import { readFileSync } from "node:fs";

export default class SyntheticReplayProvider {
  id() { return "nodejs-synthetic-replay"; }

  async callApi(_prompt, context) {
    try {
      const plans = JSON.parse(readFileSync(new URL("./synthetic-plans.json", import.meta.url), "utf8"));
      const plan = plans[context.vars.scenario.id];
      if (!plan) return { error: "Unknown synthetic scenario" };
      return { output: JSON.stringify(plan) };
    } catch (error) {
      return { error: error.message };
    }
  }
}
