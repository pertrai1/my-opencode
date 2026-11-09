import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { captureSnapshot } from "./pr-agent-snapshot.mjs";
import { checkPrerequisites, runActions, validateRequest, viewReview } from "./pr-agent-runtime.mjs";

export function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    scope: { type: "string" }, base: { type: "string" }, pr: { type: "string" },
    focus: { type: "string" }, question: { type: "string" }, npx: { type: "boolean" },
  } });
  const [operation = "", target, ...rest] = positionals;
  if (rest.length) throw new Error("Unexpected positional arguments; use --focus or --question for text.");
  if (operation === "check") {
    const result = checkPrerequisites();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result.status === "ready" ? 0 : 1;
  }
  if (operation === "view" && target) {
    viewReview(target, { npx: values.npx });
    return 0;
  }
  if (operation !== "run") throw new Error("Usage: pr-agent.mjs check | run [review,describe,improve,ask] [options] | view <directory> [--npx]");
  const request = { ...values, actions: (target ?? "review").split(",") };
  validateRequest(request);
  const prerequisites = checkPrerequisites(undefined, request);
  if (prerequisites.status !== "ready") {
    process.stdout.write(`${JSON.stringify(prerequisites)}\n`);
    return 1;
  }
  const result = runActions(captureSnapshot(values), request);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.status === "completed" ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
