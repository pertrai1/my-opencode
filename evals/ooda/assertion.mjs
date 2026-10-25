import { evaluate } from "./harness.mjs";

// Regrade actions; never trust a provider-supplied pass flag or fabricated evidence.
export default async function grade(output, context) {
  try {
    const value = typeof output === "string" ? JSON.parse(output) : output;
    if (value?.id !== context.vars.scenario || !Array.isArray(value.trace)) throw new Error("Missing or mismatched episode trace");
    const actions = value.trace.filter(entry => entry.action).map(entry => entry.action);
    const result = await evaluate(value.id, async () => actions.shift());
    if (JSON.stringify(result.trace) !== JSON.stringify(value.trace)) throw new Error("Trace differs from deterministic tool observations");
    return { pass: result.pass, score: result.pass ? 1 : 0, reason: result.pass ? "Actions and evidence satisfy the episode" : result.failures.join("; ") };
  } catch (error) {
    return { pass: false, score: 0, reason: error.message };
  }
}
