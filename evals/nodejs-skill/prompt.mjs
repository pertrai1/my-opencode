import { readFileSync } from "node:fs";

export default function prompt({ vars }) {
  const skill = readFileSync(new URL("../../skills/nodejs/SKILL.md", import.meta.url), "utf8");
  return `Decide whether to apply this skill and propose a minimal task plan.
Skill metadata and instructions:
${skill}
Task:
${vars.scenario.task}
Return JSON only: {"activate":boolean,"references":[topic slugs],"actions":[action tags],"migrations":[]}.
Choose only relevant topic slugs from async-and-errors, security-and-validation,
testing, runtime-reliability, services-and-production.
Use applicable action tags from: await-owned-work, forward-route-error,
test-rejection, preserve-stdout, stderr-diagnostics, nonzero-exit, stream-cleanup,
propagate-rejection, preserve-exports, host-owns-process, separate-arguments,
validate-options, test-hostile-input, stop-intake, bounded-drain, close-resources,
bound-concurrency, cancel-inflight, worker-only.
If the skill does not apply, return empty references/actions. List any proposed
runtime, module-system, framework, or tool migration in migrations.`;
}
