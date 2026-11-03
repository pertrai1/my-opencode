import { grade } from "./grade.mjs";

export default function assertion(output, context) {
  return grade(output, context.vars.scenario) === context.vars.expected;
}
