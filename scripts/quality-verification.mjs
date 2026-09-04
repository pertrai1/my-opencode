#!/usr/bin/env node
/**
 * Usage examples:
 *
 *   node ~/.config/opencode/scripts/quality-verification.mjs --changed
 *   node ~/.config/opencode/scripts/quality-verification.mjs --check dead-code
 *   node ~/.config/opencode/scripts/quality-verification.mjs --check loc --check types --target plugins
 *   node ~/.config/opencode/scripts/quality-verification.mjs --check coverage --test-arg tests/safety.test.js
 *   node ~/.config/opencode/scripts/quality-verification.mjs --check cognitive --fallow-arg --top --fallow-arg 10
 *
 * With no options, the runner checks staged, unstaged, and untracked
 * JavaScript and TypeScript source files. Each run writes JSON evidence and a
 * human-readable Markdown report to .agents/reports/quality-report-<TIMESTAMP>.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ignore from "ignore";
import ts from "typescript";

const CHECKS = ["cyclomatic", "cognitive", "halstead", "loc", "coverage", "crap", "dead-code", "duplicates", "types"];
const FALLOW = new Set(["cyclomatic", "cognitive", "crap", "dead-code", "duplicates"]);
const DEFAULT = [...CHECKS];
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const FALLOW_ARGUMENTS = new Map([["--top", "positive-integer"]]);
const TEST_ARGUMENTS = new Map([["--test-name-pattern", "value"], ["--test-only", "none"]]);
const THRESHOLDS = {
  cyclomatic: "< 22",
  cognitive: "< 22",
  halstead: "< 80",
  loc: "< 500 lines",
  coverage: "100% lines, branches, functions, and statements",
  crap: "< 25",
  "dead-code": "0 findings",
  duplicates: "0 findings",
  types: "0 explicit any or unknown types",
};
const fail = (message) => { throw new Error(message); };

function validateForwardedArgs(args, supported, label, allowPositionals = false) {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const kind = supported.get(argument);
    if (!kind) {
      if (allowPositionals && !argument.startsWith("-")) continue;
      fail(`Unsupported ${label}: ${argument}`);
    }
    if (kind === "none") continue;
    const value = args[++index];
    if (!value || value.startsWith("-")) fail(`Missing value for ${argument}`);
    if (kind === "positive-integer" && (!/^\d+$/.test(value) || Number(value) < 1)) fail(`Invalid value for ${argument}: ${value}`);
  }
}

export function parseArgs(argv = process.argv.slice(2)) {
  const result = { checks: [], changed: false, target: null, testArgs: [], fallowArgs: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const option = argv[i];
    if (option === "--changed") { result.changed = true; continue; }
    if (!["--check", "--target", "--test-arg", "--fallow-arg"].includes(option)) fail(`Unknown option: ${option}`);
    if (i + 1 >= argv.length) fail(`Missing value for ${option}`);
    const value = argv[++i];
    if (["--check", "--target"].includes(option) && value.startsWith("--")) fail(`Missing value for ${option}`);
    if (option === "--check") { if (!CHECKS.includes(value)) fail(`Unknown check: ${value}`); result.checks.push(value); }
    else if (option === "--target") result.target = value;
    else if (option === "--test-arg") result.testArgs.push(value);
    else result.fallowArgs.push(value);
  }
  if (result.changed && result.target) fail("--changed cannot be combined with --target");
  validateForwardedArgs(result.fallowArgs, FALLOW_ARGUMENTS, "--fallow-arg");
  validateForwardedArgs(result.testArgs, TEST_ARGUMENTS, "--test-arg", true);
  result.checks = [...new Set(result.checks.length ? result.checks : DEFAULT)];
  return result;
}

function run(command, args, cwd, input) {
  try { return { code: 0, stdout: execFileSync(command, args, { cwd, encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] }) }; }
  catch (error) { return { code: error.status ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? error.message }; }
}

export function discoverSources(root) {
  const result = new Set();
  const git = (args) => run("git", args, root).stdout;
  const names = [git(["diff", "--name-only", "--diff-filter=ACMR"]), git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]), git(["ls-files", "--others", "--exclude-standard"])]
    .flatMap((text) => text.split(/\r?\n/)).filter(Boolean);
  for (const name of names) if (/\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(name) && fs.existsSync(path.join(root, name))) result.add(name);
  return [...result].sort();
}
export function targetSources(root, target) {
  const resolved = path.resolve(root, target);
  const relativePath = path.relative(root, resolved);
  if (relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) fail("Target is outside the target worktree");
  const realRoot = fs.realpathSync(root);
  const realTarget = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
  const realRelative = path.relative(realRoot, realTarget);
  if (realRelative === ".." || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) fail("Target is outside the target worktree");
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return /\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(resolved) ? [path.relative(root, resolved)] : [];
  }
  if (!fs.existsSync(resolved)) return [];
  const relative = relativePath === "" ? "." : relativePath;
  const gitFiles = run("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", relative], root);
  if (gitFiles.code === 0) {
    const files = gitFiles.stdout.split(/\r?\n/)
      .filter((file) => /\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(file) && fs.existsSync(path.join(root, file)));
    const ignored = ignoredByGit(root, files);
    return files
      .filter((file) => !ignored.has(file))
      .sort();
  }
  return collectSources(root, resolved, ignore()).sort();
}
function ignoredByGit(root, files) {
  if (!files.length) return new Set();
  const result = run("git", ["check-ignore", "--no-index", "-z", "--stdin"], root, files.join("\0"));
  return new Set(result.stdout.split("\0").filter(Boolean));
}
function addIgnoreRules(root, directory, matcher) {
  const ignorePath = path.join(directory, ".gitignore");
  if (!fs.existsSync(ignorePath)) return;
  const relative = path.relative(root, directory).split(path.sep).join("/");
  const rules = fs.readFileSync(ignorePath, "utf8").split(/\r?\n/).filter((rule) => rule && !rule.startsWith("#")).flatMap((rule) => {
    if (!relative) return [rule];
    const negated = rule.startsWith("!");
    const pattern = rule.slice(negated ? 1 : 0).replace(/^\//, "");
    const prefix = negated ? "!" : "";
    return pattern.includes("/") ? [`${prefix}${relative}/${pattern}`] : [`${prefix}${relative}/${pattern}`, `${prefix}${relative}/**/${pattern}`];
  });
  matcher.add(rules);
}
function collectSources(root, directory, matcher) {
  addIgnoreRules(root, directory, matcher);
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", "build"].includes(entry.name)) continue;
    const child = path.join(directory, entry.name);
    const relative = path.relative(root, child).split(path.sep).join("/");
    if (matcher.ignores(relative)) continue;
    if (entry.isDirectory()) files.push(...collectSources(root, child, matcher));
    else if (/\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

function item(check, status, value, paths = [], diagnostic = "") { return { check, status, threshold: THRESHOLDS[check], value, paths, diagnostic }; }
export function parseFallow(parsed, checks, inventory) {
  let data;
  try { data = JSON.parse(parsed.stdout); } catch {
    return checks.map((check) => item(check, "error", null, inventory, "Fallow returned invalid JSON"));
  }
  if (parsed.code !== 0 && !data.kind) {
    return checks.map((check) => item(check, "error", null, inventory, "Fallow execution failed"));
  }
  const findings = (data.findings ?? data.clone_groups ?? Object.values(data).filter(Array.isArray).flat()).filter((finding) => {
    const source = finding.path ?? finding.file;
    if (source) return inventory.some((file) => String(source).endsWith(file));
    return finding.instances?.some((instance) => inventory.some((file) => String(instance.file).endsWith(file))) ?? false;
  });
  return checks.map((check) => {
    if (check === "crap" && findings.some((finding) => finding.coverage_source !== "istanbul")) {
      const paths = findings.filter((finding) => finding.coverage_source !== "istanbul").map((finding) => finding.path ?? finding.file).filter(Boolean);
      return item(check, "error", null, paths, "Fallow did not produce measured coverage for every CRAP finding");
    }
    const bad = findings.filter((finding) => {
      if (check === "cyclomatic") return finding.cyclomatic >= 22;
      if (check === "cognitive") return finding.cognitive >= 22;
      if (check === "crap") return finding.crap >= 25;
      return true;
    });
    const details = bad.map(({ path: findingPath, file, name, line, cyclomatic, cognitive, crap, coverage_source: coverageSource }) => ({ path: findingPath ?? file, name, line, cyclomatic, cognitive, crap, coverageSource }));
    return item(check, bad.length ? "fail" : "pass", bad.length, bad.map((finding) => finding.path ?? finding.file).filter(Boolean), JSON.stringify(details));
  });
}
export function fallow(root, checks, args, inventory, coveragePath) {
  const result = [];
  const health = checks.filter((check) => ["cyclomatic", "cognitive", "crap"].includes(check));
  const runnableHealth = health.filter((check) => check !== "crap" || coveragePath);
  if (health.includes("crap") && !coveragePath) {
    result.push(item("crap", "error", null, inventory, "CRAP requires an Istanbul coverage report"));
  }
  if (runnableHealth.length) {
    const parsed = run("npx", ["--yes", "fallow", "health", "--format", "json", "--no-cache", "--complexity", "--max-cyclomatic", "21", "--max-cognitive", "21", "--max-crap", health.includes("crap") ? "0" : "24", ...(coveragePath ? ["--coverage", coveragePath, "--coverage-root", root] : []), ...args], root);
    result.push(...parseFallow(parsed, runnableHealth, inventory));
  }
  if (checks.includes("dead-code")) {
    const parsed = run("npx", ["--yes", "fallow", "dead-code", "--format", "json", "--no-cache", ...inventory.flatMap((file) => ["--file", file]), ...args], root);
    result.push(...parseFallow(parsed, ["dead-code"], inventory));
  }
  if (checks.includes("duplicates")) {
    const parsed = run("npx", ["--yes", "fallow", "dupes", "--format", "json", "--no-cache", "--threshold", "0", ...args], root);
    result.push(...parseFallow(parsed, ["duplicates"], inventory));
  }
  return result;
}
function localChecks(root, checks, inventory) {
  return checks.map((check) => {
    if (!inventory.length) return item(check, "pass", 0, [], "No changed source files");
    if (check === "loc") { const bad = inventory.filter((p) => lineCount(fs.readFileSync(path.join(root, p), "utf8")) >= 500); return item(check, bad.length ? "fail" : "pass", bad.length, bad); }
    if (check === "types") {
      const bad = inventory.filter((file) => {
        if (!/\.tsx?$/.test(file)) return false;
        const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), "utf8"), ts.ScriptTarget.Latest, true);
        let found = false;
        const visit = (node) => { if (node.kind === ts.SyntaxKind.AnyKeyword || node.kind === ts.SyntaxKind.UnknownKeyword) found = true; ts.forEachChild(node, visit); };
        visit(source);
        return found;
      });
      return item(check, bad.length ? "fail" : "pass", bad.length, bad, "Explicit any/unknown policy");
    }
    return item(check, "skipped", null, inventory, "Handled by analyzer adapter");
  });
}
export function lineCount(source) { return source === "" ? 0 : source.replace(/\r?\n$/, "").split(/\r?\n/).length; }
function halstead(root, inventory) {
  if (!inventory.length) return item("halstead", "pass", 0);
  const out = path.join(os.tmpdir(), `halstead-${process.pid}.json`);
  const parsed = run("node", [path.join(SCRIPT_DIRECTORY, "halstead-analyzer.js"), "--files", inventory.join(","), "--out", out], root);
  try {
    const data = JSON.parse(fs.readFileSync(out, "utf8"));
    const missing = inventory.filter((file) => data[file]?.difficulty == null);
    if (parsed.code !== 0 || missing.length) return item("halstead", "error", null, missing.length ? missing : inventory, "Halstead output unavailable");
    return evaluateHalstead(data, inventory);
  } catch { return item("halstead", "error", null, inventory, "Halstead output unavailable"); } finally { if (fs.existsSync(out)) fs.unlinkSync(out); }
}
export function evaluateHalstead(data, inventory) {
  const bad = inventory.filter((file) => Number(data[file]?.difficulty) >= 80);
  return item("halstead", bad.length ? "fail" : "pass", bad.length, bad);
}
export function testCommand(root) {
  const manifest = path.join(root, "package.json");
  const declared = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, "utf8")).packageManager?.split("@")[0] : null;
  const locked = [
    fs.existsSync(path.join(root, "package-lock.json")) && "npm",
    fs.existsSync(path.join(root, "pnpm-lock.yaml")) && "pnpm",
    fs.existsSync(path.join(root, "yarn.lock")) && "yarn",
    (fs.existsSync(path.join(root, "bun.lock")) || fs.existsSync(path.join(root, "bun.lockb"))) && "bun",
  ].filter(Boolean);
  if (declared && !["npm", "pnpm", "yarn", "bun"].includes(declared)) fail(`Unsupported package manager: ${declared}`);
  if (!declared && locked.length > 1) fail("Ambiguous package manager lockfiles; declare packageManager in package.json");
  const manager = declared ?? locked.at(0) ?? "npm";
  if (manager === "bun") return ["bun", "run", "test"];
  if (manager === "pnpm") return ["pnpm", "test"];
  if (manager === "yarn") return ["yarn", "test"];
  return ["npm", "test"];
}
export function normalizeCoverage(value) {
  if (value === -1) return 1;
  if (Array.isArray(value)) return value.map(normalizeCoverage);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeCoverage(entry)]));
  return value;
}
export function coverageCommand(root, reportsDir, inventory, args) {
  return ["--yes", "c8", "--reporter", "json", "--reports-dir", reportsDir, "--temp-directory", path.join(reportsDir, "v8"), "--all", ...inventory.flatMap((file) => ["--include", file]), ...testCommand(root), "--", ...args];
}
function coverage(root, args, inventory) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "quality-coverage-"));
  const report = path.join(temp, "coverage-final.json");
  const cleanup = () => fs.rmSync(temp, { recursive: true, force: true });
  try {
    if (testCommand(root).at(0) === "bun") return { result: item("coverage", "error", null, inventory, "Bun coverage is not supported"), cleanup };
    const parsed = run("npx", coverageCommand(root, temp, inventory, args), root);
    if (parsed.code) return { result: item("coverage", "error", null, inventory, "Coverage command failed"), cleanup };
    const data = normalizeCoverage(JSON.parse(fs.readFileSync(report, "utf8")));
    fs.writeFileSync(report, JSON.stringify(data));
    return { result: evaluateCoverage(root, data, inventory), coveragePath: report, cleanup };
  } catch { return { result: item("coverage", "error", null, inventory, "Coverage artifact unavailable"), cleanup }; }
}
export function evaluateCoverage(root, data, inventory) {
  const bad = inventory.filter((file) => {
    const entry = data[path.resolve(root, file)] ?? data[file];
    return !entry || ["l", "b", "f", "s"].some((key) => {
      const dimension = entry[key];
      return !dimension || Object.values(dimension).some((count) => Array.isArray(count) ? count.some((value) => value === 0) : count === 0);
    });
  });
  return item("coverage", bad.length ? "fail" : "pass", bad.length, bad);
}
function remediation(check) {
  const guidance = {
    cyclomatic: "Simplify the affected function by extracting independent decision paths.",
    cognitive: "Reduce nesting and branching in the affected function.",
    halstead: "Simplify the affected file or function and remove unnecessary operators or operands.",
    loc: "Split the affected file into focused modules below 500 lines.",
    coverage: "Add tests that execute every changed line, branch, and function.",
    crap: "Add focused coverage or simplify the affected function to reduce risk.",
    "dead-code": "Remove the unused file, export, dependency, or member, or configure a justified exclusion.",
    duplicates: "Extract the repeated logic into one shared implementation.",
    types: "Replace explicit any or unknown types with an approved concrete type.",
  };
  return guidance[check] ?? "Review the diagnostic output and resolve the reported finding.";
}
function markdownReport(report, jsonPath) {
  const failed = report.results.filter((result) => result.status === "fail" || result.status === "error");
  const lines = [
    "# Quality Report",
    "",
    "## Metadata",
    "",
    `- Status: **${report.overallStatus.toUpperCase()}**`,
    `- Scope: \`${report.sourceScope}\``,
    `- Target repository: \`${report.targetRoot}\``,
    `- Timestamp (UTC): ${report.reportTimestamp}`,
    `- JSON evidence: \`${path.relative(report.targetRoot, jsonPath)}\``,
    `- Source files analyzed: ${report.sourceInventory.length}`,
    "",
    "## Check Results",
    "",
    "| Check | Status | Threshold | Value |",
    "| --- | --- | --- | --- |",
    ...report.results.map((result) => `| ${result.check} | ${result.status} | ${result.threshold} | ${result.value ?? "n/a"} |`),
  ];
  if (failed.length === 0) {
    lines.push("", "## Disposition", "", "**passed** - All selected quality checks passed.");
    return `${lines.join("\n")}\n`;
  }
  lines.push("", "## Findings", "");
  for (const result of failed) {
    lines.push(`### ${result.check} (${result.status})`, "");
    lines.push(`- Threshold: ${result.threshold}`);
    lines.push(`- Value: ${result.value ?? "unavailable"}`);
    lines.push(`- Affected files: ${result.paths.length ? result.paths.map((file) => `\`${file}\``).join(", ") : "None reported"}`);
    lines.push(`- Recommended resolution: ${remediation(result.check)}`);
    if (result.diagnostic) lines.push(`- Diagnostic: \`${result.diagnostic.slice(0, 1000).replace(/`/g, "'")}\``);
    lines.push("");
  }
  lines.push("## Disposition", "", "**failed** - Resolve the findings above, then run the same quality command again.");
  return `${lines.join("\n")}\n`;
}
export function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help")) {
    console.log("Usage: quality-verification.mjs [--changed | --target <path>] [--check <name>] [--test-arg <arg>] [--fallow-arg <arg>]");
    return 0;
  }
  let options; try { options = parseArgs(argv); } catch (error) { console.error(error.message); return 2; }
  const root = path.resolve(process.cwd()); const inventory = options.target ? targetSources(root, options.target) : discoverSources(root);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportsDirectory = path.join(root, ".agents/reports");
  const reportPath = path.join(reportsDirectory, `quality-report-${timestamp}.json`);
  const markdownPath = path.join(reportsDirectory, `quality-report-${timestamp}.md`);
  fs.mkdirSync(reportsDirectory, { recursive: true });
  let results;
  if (!inventory.length) results = options.checks.map((check) => item(check, "pass", 0, [], "No changed source files available"));
  else {
    const coverageRun = options.checks.some((check) => check === "coverage" || check === "crap") ? coverage(root, options.testArgs, inventory) : null;
    try {
      results = [
        ...localChecks(root, options.checks.filter((c) => ["loc", "types"].includes(c)), inventory),
        ...(options.checks.some((c) => FALLOW.has(c)) ? fallow(root, options.checks.filter((c) => FALLOW.has(c)), options.fallowArgs, inventory, coverageRun?.coveragePath) : []),
        ...(options.checks.includes("halstead") ? [halstead(root, inventory)] : []),
        ...(options.checks.includes("coverage") ? [coverageRun.result] : []),
      ];
    } finally { coverageRun?.cleanup(); }
  }
  const overall = results.some((r) => r.status === "fail" || r.status === "error") ? "fail" : "pass";
  const report = { schemaVersion: 1, invocation: argv, targetRoot: root, sourceScope: options.target ? "target" : "changed", sourceInventory: inventory, selectedChecks: options.checks, results, overallStatus: overall, reportTimestamp: new Date().toISOString(), markdownReportPath: markdownPath };
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(markdownPath, markdownReport(report, reportPath));
  } catch (error) { console.error(error.message); return 2; }
  console.log("Quality verification result", { status: overall, reportPath, markdownPath }); return overall === "pass" ? 0 : 1;
}
if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main();
