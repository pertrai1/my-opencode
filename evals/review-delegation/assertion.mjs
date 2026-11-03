import { isDeepStrictEqual } from "node:util";
import { assess, evaluate } from "./harness.mjs";

function batchReader(trace) {
  let index = 1;
  return () => {
    const turn = trace[index]?.turn;
    const actions = [];
    do {
      actions.push(trace[index++]?.action);
    } while (index < trace.length && trace[index].turn === turn);
    return actions;
  };
}

export default async function grade(output, context) {
  const fail = (reason) => ({ pass: false, score: 0, reason });
  try {
    const candidate = typeof output === "string" ? JSON.parse(output) : output;
    const id = context.vars.scenario;
    if (candidate?.id !== id || !Array.isArray(candidate.trace))
      return fail("Missing or mismatched scenario/trace");
    const replayed = await evaluate(id, batchReader(candidate.trace));
    if (!isDeepStrictEqual(replayed.trace, candidate.trace))
      return fail(
        "Trace observations or action boundaries do not match replay",
      );
    return assess(id, replayed.trace);
  } catch (error) {
    return fail(`Invalid review trace: ${error.message}`);
  }
}
