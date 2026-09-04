#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

export const STAGES = ["typecheck", "lint", "test"];
export const DEFAULT_TIMEOUT_SECONDS = 1_800;
const MAX_OUTPUT_BYTES = 32 * 1024;
const HEAD_OUTPUT_BYTES = 8 * 1024;
const REDACTED = "[REDACTED]";

function fail(message) {
  const error = new Error(message);
  error.runnerError = true;
  throw error;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = { target: ".", timeoutSeconds: DEFAULT_TIMEOUT_SECONDS, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--help") options.help = true;
    else if (option === "--target" || option === "--timeout") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) fail(`Missing value for ${option}`);
      if (option === "--target") options.target = value;
      else {
        const timeout = Number(value);
        if (!Number.isInteger(timeout) || timeout <= 0) fail("--timeout must be a positive integer number of seconds");
        options.timeoutSeconds = timeout;
      }
    } else fail(`Unknown option: ${option}`);
  }
  return options;
}

export function targetRoot(target, cwd = process.cwd()) {
  const root = path.resolve(cwd, target);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail(`Target directory does not exist: ${root}`);
  return fs.realpathSync(root);
}

export function redact(value) {
  return String(value)
    .replace(/(authorization\s*:\s*(?:bearer|basic)\s+)[^\s"'`]+/gi, `$1${REDACTED}`)
    .replace(/((?:api[_-]?key|secret|token|password|passwd|pwd|client[_-]?secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*["']?)[^\s"',`]+/gi, `$1${REDACTED}`)
    .replace(/(-----BEGIN [^-]+-----)[\s\S]*?(-----END [^-]+-----)/g, `$1\n${REDACTED}\n$2`)
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, REDACTED);
}

export function condenseOutput(value, maxBytes = MAX_OUTPUT_BYTES, headBytes = HEAD_OUTPUT_BYTES) {
  const capture = createOutputCapture(maxBytes, headBytes);
  capture.append(value);
  return capture.result();
}

export function createOutputCapture(maxBytes = MAX_OUTPUT_BYTES, headBytes = HEAD_OUTPUT_BYTES) {
  const tailBytes = maxBytes - headBytes;
  let totalBytes = 0;
  let retained = Buffer.alloc(0);
  let head = Buffer.alloc(0);
  let tail = Buffer.alloc(0);
  return {
    append(value) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
      totalBytes += chunk.length;
      if (totalBytes <= maxBytes) {
        retained = Buffer.concat([retained, chunk]);
        return;
      }
      if (head.length === 0) {
        head = retained.length ? retained.subarray(0, headBytes) : chunk.subarray(0, headBytes);
        tail = chunk.length >= tailBytes ? chunk.subarray(-tailBytes) : Buffer.concat([retained.subarray(-tailBytes), chunk]).subarray(-tailBytes);
        retained = Buffer.alloc(0);
        return;
      }
      tail = Buffer.concat([tail, chunk]).subarray(-tailBytes);
    },
    result() {
      if (totalBytes <= maxBytes) return { text: redact(retained.toString()), truncated: false, omittedBytes: 0 };
      const omittedBytes = totalBytes - maxBytes;
      return { text: redact(`${head}\n[... ${omittedBytes} bytes omitted ...]\n${tail}`), truncated: true, omittedBytes };
    },
  };
}

export function readManifest(root) {
  const manifestPath = path.join(root, "package.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("package.json must contain an object");
    return value;
  } catch (error) {
    if (error.runnerError) throw error;
    fail(`Unable to parse package.json: ${error.message}`);
  }
}

export function discoverStages(manifest) {
  const scripts = manifest?.scripts && typeof manifest.scripts === "object" ? manifest.scripts : {};
  return STAGES.map((name) => ({ name, configured: typeof scripts[name] === "string" }));
}

export function selectPackageManager(root, manifest) {
  const declared = typeof manifest?.packageManager === "string" ? manifest.packageManager.split("@")[0] : null;
  const lockfiles = [
    ["package-lock.json", "npm"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
  ].filter(([file]) => fs.existsSync(path.join(root, file)));
  const supported = new Set(["npm", "pnpm", "yarn", "bun"]);
  if (declared) {
    if (!supported.has(declared)) fail(`Unsupported package manager: ${declared}`);
    return { name: declared, source: "packageManager", lockfiles: lockfiles.map(([file]) => file) };
  }
  const managers = [...new Set(lockfiles.map(([, manager]) => manager))];
  if (managers.length !== 1) fail(managers.length ? "Ambiguous package manager lockfiles; declare packageManager in package.json" : "No package manager declared or detected from a supported lockfile");
  return { name: managers.at(0), source: "lockfile", lockfiles: lockfiles.map(([file]) => file) };
}

export function commandFor(manager, stage) {
  return { executable: manager, args: ["run", stage], display: `${manager} run ${stage}` };
}

function git(root, args) {
  try { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; }
}

export function gitState(root) {
  const topLevel = git(root, ["rev-parse", "--show-toplevel"]);
  if (!topLevel) return { available: false };
  const status = git(root, ["status", "--porcelain=v1", "--untracked-files=all"]) ?? "";
  const paths = status.split("\n").filter(Boolean).map((line) => line.slice(3)).filter((file) => !file.startsWith(".agents/reports/"));
  return {
    available: true,
    root: topLevel,
    head: git(root, ["rev-parse", "HEAD"]),
    branch: git(root, ["branch", "--show-current"]),
    dirty: paths.length > 0,
    paths,
  };
}

function environment() {
  return {
    ...process.env,
    CI: process.env.CI ?? "1",
    ...(process.env.FORCE_COLOR === undefined ? { NO_COLOR: process.env.NO_COLOR ?? "1" } : {}),
  };
}

export function runCommand(command, root, timeoutSeconds) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();
    let spawnError;
    let timedOut = false;
    const child = spawn(command.executable, command.args, { cwd: root, env: environment(), shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutSeconds * 1_000);
    child.stdout.on("data", (chunk) => { stdout.append(chunk); });
    child.stderr.on("data", (chunk) => { stderr.append(chunk); });
    child.on("error", (error) => { spawnError = error; });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      const status = spawnError || timedOut ? "error" : exitCode === 0 ? "passed" : "failed";
      resolve({
        ...command,
        cwd: root,
        status,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        exitCode,
        signal,
        timedOut,
        error: spawnError?.message ?? null,
        stdout: stdout.result(),
        stderr: stderr.result(),
      });
    });
  });
}

function reportId() {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(4).toString("hex")}`;
}

function gitLabel(state) { return state.available ? `\`${state.head ?? "unborn"}\`, ${state.dirty ? "dirty" : "clean"}` : "unavailable"; }
function diagnostics(stage) {
  const lines = [`### ${stage.name} (${stage.status})`, "", `- Command: \`${stage.display}\``];
  if (stage.timedOut) lines.push("- Timed out: yes");
  if (stage.error) lines.push(`- Runner error: ${stage.error}`);
  for (const [label, output] of [["stdout", stage.stdout], ["stderr", stage.stderr]]) if (output.text) lines.push("", `#### ${label}`, "", "```text", output.text, "```");
  return lines;
}
function markdown(report, jsonPath) {
  const rows = report.stages.map((stage) => `| ${stage.name} | ${stage.status} | ${stage.display ?? "n/a"} | ${stage.exitCode ?? "n/a"} |`);
  const lines = ["# Checks Report", "", "## Metadata", "", `- Status: **${report.overallStatus.toUpperCase()}**`, `- Run ID: \`${report.runId}\``, `- Target repository: \`${report.targetRoot}\``, `- Started (UTC): ${report.startedAt}`, `- Completed (UTC): ${report.completedAt}`, `- Timeout per stage: ${report.timeoutSeconds}s`, `- JSON evidence: \`${path.relative(report.targetRoot, jsonPath)}\``, `- Git state before: ${gitLabel(report.git.before)}`, `- Git state after: ${gitLabel(report.git.after)}`, "", "## Check Results", "", "| Stage | Status | Command | Exit code |", "| --- | --- | --- | --- |", ...rows];
  const details = report.stages.filter((stage) => stage.status === "failed" || stage.status === "error");
  if (details.length) lines.push("", "## Diagnostics", "", ...details.flatMap(diagnostics));
  lines.push("", "## Disposition", "", report.overallStatus === "passed" ? "**passed** — All configured baseline checks passed." : "**not passed** — This is historical evidence; rerun if target repository state has changed.", "", "Diagnostic redaction is best-effort.");
  return `${lines.join("\n")}\n`;
}

function writePair(report) {
  const directory = path.join(report.targetRoot, ".agents", "reports");
  const jsonPath = path.join(directory, `checks-${report.runId}.json`);
  const markdownPath = path.join(directory, `checks-${report.runId}.md`);
  fs.mkdirSync(directory, { recursive: true });
  const jsonTemp = `${jsonPath}.tmp-${process.pid}`;
  const markdownTemp = `${markdownPath}.tmp-${process.pid}`;
  try {
    report.reportPaths = { json: jsonPath, markdown: markdownPath };
    fs.writeFileSync(jsonTemp, JSON.stringify(report, null, 2));
    fs.writeFileSync(markdownTemp, markdown(report, jsonPath));
    fs.renameSync(jsonTemp, jsonPath);
    fs.renameSync(markdownTemp, markdownPath);
    return report.reportPaths;
  } catch (error) {
    for (const temporary of [jsonTemp, markdownTemp]) { try { fs.rmSync(temporary, { force: true }); } catch { void 0; } }
    throw error;
  }
}

function stageRecord(name, status) {
  return { name, status, executable: null, args: [], display: null, cwd: null, startedAt: null, completedAt: null, durationMs: null, exitCode: null, signal: null, timedOut: false, error: null, stdout: condenseOutput(""), stderr: condenseOutput("") };
}

async function execute(report, root, options) {
  const manifest = readManifest(root); const discovered = discoverStages(manifest);
  report.stages = discovered.map(({ name, configured }) => stageRecord(name, configured ? "not-run" : "not-configured"));
  if (!discovered.some((stage) => stage.configured)) { report.overallStatus = "blocked"; return; }
  const manager = selectPackageManager(root, manifest); report.toolchain.packageManager = manager;
  for (const stage of report.stages) {
    if (stage.status !== "not-run") continue;
    Object.assign(stage, await runCommand(commandFor(manager.name, stage.name), root, options.timeoutSeconds));
    if (stage.status !== "passed") break;
  }
  report.overallStatus = report.stages.some((stage) => stage.status === "error") ? "error" : report.stages.some((stage) => stage.status === "failed") ? "failed" : "passed";
}

export async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  let options;
  try { options = parseArgs(argv); } catch (error) { console.error(error.message); return 2; }
  if (options.help) {
    console.log("Usage: checks-runner.mjs [--target <directory>] [--timeout <seconds>]");
    return 0;
  }
  let root;
  try { root = targetRoot(options.target, cwd); } catch (error) { console.error(error.message); return 2; }
  const report = {
    schemaVersion: 1, runId: reportId(), invocation: argv, targetRoot: root, startedAt: new Date().toISOString(), completedAt: null,
    timeoutSeconds: options.timeoutSeconds, toolchain: { node: process.version, packageManager: null }, git: { before: gitState(root), after: null }, stages: STAGES.map((name) => stageRecord(name, "not-configured")), overallStatus: "error", reportPaths: null,
  };
  try {
    await execute(report, root, options);
  } catch (error) {
    report.overallStatus = "error";
    report.runnerError = error.message;
  }
  report.git.after = gitState(root);
  report.completedAt = new Date().toISOString();
  try {
    const paths = writePair(report);
    console.log("Checks result", { status: report.overallStatus });
    console.log("Checks JSON report", { path: paths.json });
    console.log("Checks Markdown report", { path: paths.markdown });
  } catch (error) {
    console.error("Checks report persistence failed", { error: error.message });
    console.error("Checks result", { status: report.overallStatus });
    return 2;
  }
  return report.overallStatus === "passed" ? 0 : report.overallStatus === "failed" || report.overallStatus === "blocked" ? 1 : 2;
}

if (import.meta.url === `file://${process.argv[1]}`) void main().then((code) => { process.exitCode = code; });
