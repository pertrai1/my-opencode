import { isDeepStrictEqual } from "node:util";
import { assess, evaluate } from "./harness.mjs";

export default async function grade(output, context) {
  const fail = (reason) => ({ pass: false, score: 0, reason });
  try {
    const candidate = typeof output === "string" ? JSON.parse(output) : output;
    const id = context.vars.scenario;
    if (candidate?.id !== id || !Array.isArray(candidate.trace))
      return fail("Missing or mismatched scenario/trace");
    let index = 1;
    const replayed = await evaluate(id, () => candidate.trace[index++]?.action);
    if (!isDeepStrictEqual(replayed.trace, candidate.trace))
      return fail(
        "Trace observations or action boundaries do not match replay",
      );
    return assess(id, replayed.trace);
  } catch (error) {
    return fail(`Invalid review trace: ${error.message}`);
  }
}
