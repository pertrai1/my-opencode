import { cases } from "./cases.mjs";
import { grade } from "./grade.mjs";

export default function assertion(output, context) {
  try {
    const result = typeof output === "string" ? JSON.parse(output) : output;

    const scenario = cases.find((item) => item.id === context.vars.scenario);

    if (
      !scenario ||
      result?.scenario !== scenario.id ||
      !Array.isArray(result.trace)
    ) {
      throw new Error("Missing or mismatched scenario trace.");
    }

    const actions = result.trace.map(({ name, args }) => ({
      name,
      args,
    }));

    return grade(scenario, actions);
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: error.message,
    };
  }
}
