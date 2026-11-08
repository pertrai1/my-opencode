import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkedOutput, processSucceeded, runProcess } from "./pr-agent-process.mjs";
import { reviewCandidates, validComment } from "./pr-agent-comments.mjs";

export { reviewCandidates } from "./pr-agent-comments.mjs";

const allowedActions = ["review", "describe", "improve", "ask"];
const digest = text => createHash("sha256").update(text).digest("hex");
const save = (directory, name, data) => writeFileSync(join(directory, name), typeof data === "string" ? data : `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });

export function checkPrerequisites(execute = runProcess, { actions = [] } = {}) {
  const result = execute("pr-agent", ["--help"], { timeout: 20_000 });
  if (result.error?.code === "ENOENT") return { status: "missing" };
  if (!processSucceeded(result)) return { status: "failed", message: "PR-Agent help failed; inspect installation without exposing credentials." };
  const found = capabilities(result.stdout ?? "");
  return found.status === "ready" && actions.includes("ask") ? askCapabilities(execute) : found;
}

function askCapabilities(execute) {
  const result = execute("pr-agent", ["--version"], { timeout: 20_000 });
  const version = result.stdout?.trim().match(/^pr-agent (\d+)\.(\d+)\.(\d+)$/);
  if (!processSucceeded(result) || !version) return { status: "incompatible", message: "Ask requires a verified PR-Agent version supporting literal questions (0.45.0 or newer)." };
  const [, major, minor] = version.map(Number);
  return major > 0 || minor >= 45 ? { status: "ready" } : { status: "incompatible", message: "Ask requires PR-Agent 0.45.0 or newer to preserve literal questions." };
}

function capabilities(help) {
  const missingFlags = ["--diff-file", "--output", "--json-output"].filter(flag => !help.includes(flag));
  return missingFlags.length ? { status: "incompatible", missingFlags } : { status: "ready" };
}

function validateActions(actions) {
  if (!actions.length || actions.some(action => !allowedActions.includes(action))) throw new Error("Unsupported action; choose review, describe, improve, or ask.");
}

export function validateRequest({ actions: requested = ["review"], question = "" }) {
  const actions = [...new Set(requested)];
  validateActions(actions);
  if (actions.includes("ask") && !question.trim()) throw new Error("Ask requires a nonempty --question.");
  return actions;
}

function localEnvironment(env) {
  // Preserve model credentials, but disable extra delivery and remote config discovery.
  const local = Object.fromEntries(Object.entries(env).filter(([key]) => !/^(?:DYNACONF_)?PUSH_OUTPUTS(?:$|__|\.)/i.test(key)));
  return { ...local, PUSH_OUTPUTS__ENABLE: "false", "PUSH_OUTPUTS.ENABLE": "false",
    PR_AGENT_EXTRA_CONFIG_URL: "", CONFIG__PROPAGATE_TOOL_ERRORS: "true",
    "CONFIG.PROPAGATE_TOOL_ERRORS": "true", CONFIG__PUBLISH_OUTPUT_PROGRESS: "false" };
}

function toolArguments(action, request, directory) {
  const args = ["--diff-file", join(directory, "changes.diff"), "--output", join(directory, `${action}.md`)];
  if (action === "review") args.push("--json-output", join(directory, "review.json"));
  args.push(action);
  if (action === "ask") args.push(`__pr_agent_encoded_text__:${encodeURIComponent(request.question)}`);
  if (request.focus?.trim()) {
    const section = { review: "pr_reviewer", describe: "pr_description", improve: "pr_code_suggestions", ask: "pr_questions" }[action];
    args.push(`--${section}.extra_instructions=${JSON.stringify(request.focus)}`);
  }
  return args;
}

function executeAction(action, request, directory, { execute, env }) {
  const result = execute("pr-agent", toolArguments(action, request, directory), { cwd: directory, env, timeout: 600_000 });
  save(directory, `${action}.log`, `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  if (!processSucceeded(result)) throw new Error(`PR-Agent ${action} failed; inspect its private log.`);
  requireMarkdown(directory, action);
  if (action === "review") saveReviewCandidates(directory);
}

function requireMarkdown(directory, action) {
  const markdown = readFileSync(join(directory, `${action}.md`), "utf8");
  if (!markdown.trim()) throw new Error(`PR-Agent ${action} returned empty output.`);
  chmodSync(join(directory, `${action}.md`), 0o600);
}

function saveReviewCandidates(directory) {
  const payload = JSON.parse(readFileSync(join(directory, "review.json"), "utf8"));
  chmodSync(join(directory, "review.json"), 0o600);
  save(directory, "candidates.json", reviewCandidates(payload, readFileSync(join(directory, "changes.diff"), "utf8")));
}

function prepareRun(snapshot, tempRoot) {
  const directory = mkdtempSync(join(tempRoot, "opencode-pr-agent-"));
  chmodSync(directory, 0o700);
  const { patch, ...scope } = snapshot;
  save(directory, "changes.diff", patch);
  save(directory, "snapshot.json", { ...scope, sha256: digest(patch) });
  save(directory, "comments.json", []);
  return directory;
}

function actionOutcome(action, request, directory, options) {
  try {
    executeAction(action, request, directory, options);
    return { action, status: "completed", markdown: join(directory, `${action}.md`) };
  } catch (error) {
    save(directory, `${action}.failure.log`, String(error));
    return { action, status: "failed", message: "Execution or output validation failed; inspect private artifacts. Remaining actions were not run." };
  }
}

export function runActions(snapshot, request, { execute = runProcess, env = process.env, tempRoot = tmpdir() } = {}) {
  const actions = validateRequest(request);
  const directory = prepareRun(snapshot, tempRoot);
  const result = { status: "completed", directory, actions: [] };
  for (const action of actions) {
    if (result.status === "failed") {
      result.actions.push({ action, status: "not_run" });
      continue;
    }
    const outcome = actionOutcome(action, request, directory, { execute, env: localEnvironment(env) });
    result.actions.push(outcome);
    result.status = outcome.status;
  }
  save(directory, "result.json", result);
  return result;
}

function approvedComments(directory, patch) {
  const comments = JSON.parse(readFileSync(join(directory, "comments.json"), "utf8"));
  if (!Array.isArray(comments) || comments.length > 100) throw new Error("Invalid approved Difit comments.");
  if (comments.some(comment => !validComment(comment, patch))) throw new Error("Invalid approved Difit comment anchor or body.");
  if (Buffer.byteLength(JSON.stringify(comments)) > 64 * 1024) throw new Error("Difit comments exceed the 64 KiB argument budget; summarize remaining findings locally.");
  return comments;
}

function reviewedPatch(directory) {
  const result = JSON.parse(readFileSync(join(directory, "result.json"), "utf8"));
  if (!result.actions?.some(item => item.action === "review" && item.status === "completed")) throw new Error("No successful review is available to display.");
  const patch = readFileSync(join(directory, "changes.diff"), "utf8");
  const snapshot = JSON.parse(readFileSync(join(directory, "snapshot.json"), "utf8"));
  if (digest(patch) !== snapshot.sha256) throw new Error("Saved snapshot changed; do not display stale review comments.");
  return patch;
}

export function viewReview(directory, { execute = runProcess, npx = false } = {}) {
  const patch = reviewedPatch(directory);
  const comments = approvedComments(directory, patch);
  const args = comments.flatMap(comment => ["--comment", JSON.stringify(comment)]);
  return checkedOutput(npx ? "npx" : "difit", [...(npx ? ["difit"] : []), ...args], {
    cwd: directory, input: patch, stdio: ["pipe", "inherit", "inherit"], timeout: 0, execute,
  });
}
