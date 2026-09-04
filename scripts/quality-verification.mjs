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
import ts from "typescript";

const CHECKS = ["cyclomatic", "cognitive", "halstead", "loc", "coverage", "crap", "dead-code", "duplicates", "types"];
const FALLOW = new Set(["cyclomatic", "cognitive", "crap", "dead-code", "duplicates"]);
const DEFAULT = [...CHECKS];
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
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
  result.checks = [...new Set(result.checks.length ? result.checks : DEFAULT)];
  return result;
}

function run(command, args, cwd) {
  try { return { code: 0, stdout: execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }) }; }
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
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return /\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(resolved) ? [path.relative(root, resolved)] : [];
  }
  if (!fs.existsSync(resolved)) return [];
  const relativePath = path.relative(root, resolved);
  const relative = relativePath === "" ? "." : relativePath;
  const gitFiles = run("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", relative], root);
  if (gitFiles.code === 0) {
    return gitFiles.stdout.split(/\r?\n/)
      .filter((file) => /\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(file) && fs.existsSync(path.join(root, file)))
      .sort();
  }
  const files = [];
  for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") continue;
    const child = path.join(resolved, entry.name);
    if (entry.isDirectory()) files.push(...targetSources(root, path.relative(root, child)));
    else if (/\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name)) files.push(path.relative(root, child));
  }
  return files.sort();
}

function item(check, status, value, paths = [], diagnostic = "") { return { check, status, threshold: THRESHOLDS[check], value, paths, diagnostic }; }
function parseFallow(parsed, checks, inventory) {
  let data;
  try { data = JSON.parse(parsed.stdout); } catch {
    const diagnostic = parsed.stderr ?? "Fallow returned invalid JSON";
    return checks.map((check) => item(check, "error", null, inventory, diagnostic));
  }
  const findings = (data.findings ?? data.clone_groups ?? []).filter((finding) => {
    const source = finding.path ?? finding.file;
    if (source) return inventory.some((file) => String(source).endsWith(file));
    return finding.instances?.some((instance) => inventory.some((file) => String(instance.file).endsWith(file))) ?? false;
  });
  return checks.map((check) => {
    const bad = findings.filter((finding) => {
      if (check === "cyclomatic") return finding.cyclomatic >= 22;
      if (check === "cognitive") return finding.cognitive >= 22;
      if (check === "crap") return finding.crap >= 25;
      return true;
    });
    return item(check, bad.length ? "fail" : "pass", bad.length, bad.map((finding) => finding.path ?? finding.file).filter(Boolean), JSON.stringify(bad));
  });
}
function fallow(root, checks, args, inventory) {
  const result = [];
  const health = checks.filter((check) => ["cyclomatic", "cognitive", "crap"].includes(check));
  if (health.length) {
    const parsed = run("npx", ["--yes", "fallow", "health", "--format", "json", "--no-cache", "--complexity", "--max-cyclomatic", "21", "--max-cognitive", "21", "--max-crap", "24", ...args], root);
    result.push(...parseFallow(parsed, health, inventory));
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
    if (check === "loc") { const bad = inventory.filter((p) => fs.readFileSync(path.join(root, p), "utf8").split(/\r?\n/).length > 499); return item(check, bad.length ? "fail" : "pass", bad.length, bad); }
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
function halstead(root, inventory) {
  if (!inventory.length) return item("halstead", "pass", 0);
  const out = path.join(os.tmpdir(), `halstead-${process.pid}.json`);
  const parsed = run("node", [path.join(SCRIPT_DIRECTORY, "halstead-analyzer.js"), "--files", inventory.join(","), "--out", out], root);
  try { const data = JSON.parse(fs.readFileSync(out, "utf8")); const bad = Object.entries(data).filter(([, v]) => Number(v.difficulty) >= 80).map(([p]) => p); return item("halstead", bad.length ? "fail" : "pass", bad.length, bad); } catch { return item("halstead", "error", null, inventory, parsed.stderr ?? "Halstead output unavailable"); } finally { if (fs.existsSync(out)) fs.unlinkSync(out); }
}
function coverage(root, args, inventory) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "quality-coverage-"));
  const report = path.join(temp, "coverage-final.json");
  const parsed = run("npx", ["--yes", "c8", "--reporter", "json", "--reports-dir", temp, "--temp-directory", path.join(temp, "v8"), "--all", "--include", inventory.join(","), "npm", "test", "--", ...args], root);
  try {
    if (parsed.code) return item("coverage", "error", null, inventory, parsed.stderr);
    const data = JSON.parse(fs.readFileSync(report, "utf8"));
    const bad = inventory.filter((file) => {
      const entry = data[path.resolve(root, file)] ?? data[file];
      return !entry || ["l", "b", "f", "s"].some((key) => Object.values(entry[`${key}`] ?? {}).some((count) => count === 0));
    });
    return item("coverage", bad.length ? "fail" : "pass", bad.length, bad);
  } catch { return item("coverage", "error", null, inventory, "Coverage artifact unavailable"); }
  finally { fs.rmSync(temp, { recursive: true, force: true }); }
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
  let options; try { options = parseArgs(argv); } catch (error) { console.error(error.message); return 2; }
  const root = path.resolve(process.cwd()); const inventory = options.target ? targetSources(root, options.target) : discoverSources(root);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportsDirectory = path.join(root, ".agents/reports");
  const reportPath = path.join(reportsDirectory, `quality-report-${timestamp}.json`);
  const markdownPath = path.join(reportsDirectory, `quality-report-${timestamp}.md`);
  fs.mkdirSync(reportsDirectory, { recursive: true });
  const results = inventory.length ? [
    ...localChecks(root, options.checks.filter((c) => ["loc", "types"].includes(c)), inventory),
    ...(options.checks.some((c) => FALLOW.has(c)) ? fallow(root, options.checks.filter((c) => FALLOW.has(c)), options.fallowArgs, inventory) : []),
    ...(options.checks.includes("halstead") ? [halstead(root, inventory)] : []),
    ...(options.checks.includes("coverage") ? [coverage(root, options.testArgs, inventory)] : []),
  ] : options.checks.map((check) => item(check, "pass", 0, [], "No changed source files available"));
  const overall = results.some((r) => r.status === "fail" || r.status === "error") ? "fail" : "pass";
  const report = { schemaVersion: 1, invocation: argv, targetRoot: root, sourceScope: options.target ? "target" : "changed", sourceInventory: inventory, selectedChecks: options.checks, results, overallStatus: overall, reportTimestamp: new Date().toISOString(), markdownReportPath: markdownPath };
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(markdownPath, markdownReport(report, reportPath));
  } catch (error) { console.error(error.message); return 2; }
  console.log("Quality verification result", { status: overall, reportPath, markdownPath }); return overall === "pass" ? 0 : 1;
}
if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main();
