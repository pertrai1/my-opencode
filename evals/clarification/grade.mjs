import { isDeepStrictEqual } from "node:util";
import { createEnvironment } from "./environment.mjs";

export function grade(testCase, actions) {
  const environment = createEnvironment(testCase.files);
  const failures = [];

  // Replay actions ourselves rather than trusting reported file changes.
  for (const action of actions) {
    try {
      environment.call(action.name, action.args);
    } catch (error) {
      failures.push(error.message);
    }
  }

  const { files, trace, stopped } = environment.snapshot();
  const asks = trace.filter((entry) => entry.name === "ask_user");
  const edits = trace.filter((entry) => entry.name === "edit_file");

  if (!stopped) {
    failures.push("Agent did not ask or finish");
  }

  if (testCase.expected.action === "ask") {
    if (asks.length !== 1) {
      failures.push("Expected one question");
    }
    if (edits.length !== 0) {
      failures.push("Edit attempted before clarification");
    }
    if (trace.at(-1)?.name !== "ask_user") {
      failures.push("Agent did not stop at clarification.");
    }
  } else {
    if (asks.length !== 0) failures.push("Unnecessary clarification.");
    if (edits.length === 0) failures.push("No edit attempted.");
    if (trace.at(-1)?.name !== "finish") {
      failures.push("Agent did not finish.");
    }
  }

  const expectedFiles = {
    ...testCase.files,
    ...testCase.expected.edits,
  };

  for (const [path, expected] of Object.entries(expectedFiles)) {
    try {
      const matches = path.endsWith(".json")
        ? isDeepStrictEqual(JSON.parse(files[path]), JSON.parse(expected))
        : files[path] === expected;

      if (!matches) {
        failures.push(`Unexpected contents: ${path}`);
      }
    } catch {
      failures.push(`Invalid JSON: ${path}`);
    }
  }

  return {
    pass: failures.length === 0,
    score: failures.length === 0 ? 1 : 0,
    reason: failures.join("; ") ?? "Mechanical checks passed.",
  };
}
