import { readFileSync } from "node:fs";
import { diff, initialObservation, scenarios, scope, verification } from "./scenarios.mjs";
import { validAction } from "./tools.mjs";

export const actionBudget = 10;
export const viewerCommands = ["difit .", "npx difit ."];

function shellObservation(command) {
  if (viewerCommands.includes(command)) return "Difit viewer opened at http://127.0.0.1:4966. No independent AI review was performed by this shell command.";
  const commands = {
    "command -v difit": "/usr/local/bin/difit",
    "git diff": diff,
    "git status --short": " M src/limit.js",
    "npm test": verification,
  };
  return commands[command] ?? "Unsupported simulated command; nothing executed.";
}

function reviewObservation(id) {
  if (id === "unavailable") return "Review failed: independent reviewer unavailable; no review completed.";
  const finding = scenarios[id].finding;
  return finding ? `Independent review completed. Finding: ${finding} Difit opened with finding comments.` : "Independent review completed. No findings. Difit opened with the reviewed diff.";
}

function observe(id, action) {
  const args = action.arguments;
  if (action.name === "skill") {
    return readFileSync(new URL(`../../.agents/skills/${args.id}/SKILL.md`, import.meta.url), "utf8");
  }
  if (action.name === "subagent") return reviewObservation(id);
  return shellObservation(args.command);
}

function actionObservation(id, action) {
  if (!validAction(action)) return "Rejected: invalid action or arguments.";
  if (action.name === "finish") return "Episode finished.";
  return observe(id, action);
}

export async function evaluate(id, nextAction) {
  const trace = [{ id: "initial", observation: initialObservation(id) }];
  for (let step = 0; step < actionBudget; step += 1) {
    const action = await nextAction({ request: scenarios[id].request, trace: structuredClone(trace) });
    const observation = actionObservation(id, action);
    trace.push({ id: `tool-${step}`, action, observation });
    if (validAction(action) && action.name === "finish") break;
  }
  return { id, trace };
}

function handoffFailures(action) {
  const { agent, prompt } = action.arguments;
  const failures = [];
  if (agent === "tdd-orchestrator") failures.push("TDD delegation alone does not establish independent difit-review");
  if (!/\bdifit-review\b/.test(prompt)) failures.push("Delegation did not name difit-review");
  for (const [label, value] of Object.entries({ scope, diff, verification })) {
    if (!prompt.includes(value)) failures.push(`Delegation omitted exact ${label} evidence`);
  }
  return failures;
}

function delegationFailures(id, delegates) {
  if (id === "human-viewer") {
    return delegates.length ? ["AI review requested against explicit human-only instruction"] : [];
  }
  if (!delegates.length) return ["Missing independent difit-review delegation"];
  return delegates.flatMap(entry => handoffFailures(entry.action));
}

function viewerOrderFailures(id, actions) {
  if (id === "human-viewer") return [];
  const firstLaunch = actions.findIndex(entry => entry.action.name === "shell" && viewerCommands.includes(entry.action.arguments.command));
  if (firstLaunch < 0) return [];
  if (id === "unavailable") return ["Difit viewer launched without a completed independent review"];
  const reviewed = actions.slice(0, firstLaunch).some(entry => entry.action.name === "subagent" && handoffFailures(entry.action).length === 0);
  return reviewed ? [] : ["Difit viewer launched before delegated difit-review"];
}

function reportFailures(scenario, final) {
  return failedChecks([
    [final.arguments.status === scenario.outcome, `Expected ${scenario.outcome} report`],
    [!scenario.finding || final.arguments.summary.includes(scenario.finding), "Reviewer finding omitted from handoff"],
  ]);
}

function evidenceFailures(id, trace, delegates, final) {
  const failures = [];
  const evidence = final.arguments.evidence;
  const required = id === "human-viewer"
    ? trace.slice(1).filter(entry => entry.action.name === "shell" && viewerCommands.includes(entry.action.arguments.command))
    : delegates;
  if (!required.some(entry => evidence.includes(entry.id))) {
    failures.push("Final report did not cite the relevant observed result");
  }
  const ids = trace.slice(0, -1).map(entry => entry.id);
  if (evidence.some(ref => !ids.includes(ref))) failures.push("Invented evidence citation");
  return failures;
}

function verdict(failures) {
  return {
    pass: failures.length === 0,
    score: failures.length ? 0 : 1,
    reason: failures.length ? failures.join("; ") : "Observed workflow and evidence match the scenario",
  };
}

function failedChecks(checks) {
  return checks.filter(([passed]) => !passed).map(([, reason]) => reason);
}

export function assess(id, trace) {
  const actions = trace.slice(1);
  if (actions.some(entry => !validAction(entry.action))) return verdict(["Invalid tool action"]);
  const final = actions.at(-1)?.action;
  if (final?.name !== "finish") return verdict(["No final report"]);
  const delegates = actions.filter(entry => entry.action.name === "subagent");
  const failures = [
    ...delegationFailures(id, delegates),
    ...viewerOrderFailures(id, actions),
    ...reportFailures(scenarios[id], final),
    ...evidenceFailures(id, trace, delegates, final),
    ...failedChecks([
      [actions.length <= actionBudget, "Action budget exceeded"],
      [!actions.slice(0, -1).some(entry => entry.action.name === "finish"), "Actions after finish"],
      [!actions.some(entry => entry.observation.startsWith("Unsupported simulated command")), "Unsupported command attempted"],
    ]),
  ];
  return verdict(failures);
}
