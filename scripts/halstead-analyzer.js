#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import ts from "typescript";
import { parseStatusRecords } from "./git-status.mjs";

const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
const ignoredDirectories = new Set([".git", "node_modules", "dist", "build"]);

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function directoryFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) return directoryFiles(file);
    return entry.isFile() && sourceExtension.test(entry.name) ? [file] : [];
  });
}

function changedPaths(root, baseRef) {
  if (baseRef !== undefined) {
    const base = git(["rev-parse", "--verify", "--end-of-options", `${baseRef}^{commit}`], root).trim();
    const mergeBase = git(["merge-base", base, "HEAD"], root).trim();
    return git(["diff", "--name-only", "--diff-filter=ACMR", "-z", mergeBase, "HEAD", "--"], root)
      .split("\0").filter(Boolean);
  }
  const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], root);
  return parseStatusRecords(status).map(record => record.path);
}

function isFile(file) {
  try {
    return lstatSync(file).isFile();
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
}

function gitFiles(baseRef, dir) {
  const root = git(["rev-parse", "--show-toplevel"]).replace(/\n$/, "");
  const filter = dir === undefined ? undefined : path.resolve(dir);
  return changedPaths(root, baseRef)
    .filter(file => sourceExtension.test(file))
    .map(file => path.join(root, file))
    .filter(file => filter === undefined || file.startsWith(`${filter}${filter.endsWith(path.sep) ? "" : path.sep}`))
    .filter(isFile)
    .map(file => path.relative(process.cwd(), file));
}

const literalKeywords = new Set([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword]);

function isOperator(kind) {
  const punctuation = kind >= ts.SyntaxKind.FirstPunctuation && kind <= ts.SyntaxKind.LastPunctuation;
  const keyword = kind >= ts.SyntaxKind.FirstKeyword && kind <= ts.SyntaxKind.LastKeyword;
  return punctuation || (keyword && !literalKeywords.has(kind));
}

function countTokens(source) {
  const operators = { values: new Set(), total: 0 };
  const operands = { values: new Set(), total: 0 };
  const pending = [source];
  for (const node of pending) {
    if (node.kind === ts.SyntaxKind.EndOfFileToken || node.kind === ts.SyntaxKind.JSDoc) continue;
    const children = node.getChildren(source);
    for (const child of children) pending.push(child);
    if (children.length) continue;
    const text = node.getText(source);
    if (!text.trim()) continue;
    const group = isOperator(node.kind) ? operators : operands;
    group.total++;
    group.values.add(text);
  }
  return { operators, operands };
}

function metricsFor(file) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest);
  const diagnostic = source.parseDiagnostics.at(0);
  if (diagnostic) throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
  const { operators, operands } = countTokens(source);
  const vocabulary = operators.values.size + operands.values.size;
  const length = operators.total + operands.total;
  const volume = vocabulary === 0 ? 0 : length * Math.log2(vocabulary);
  const difficulty = operands.values.size === 0 ? 0 : (operators.values.size / 2) * (operands.total / operands.values.size);
  const effort = difficulty * volume;
  return {
    operators: { distinct: operators.values.size, total: operators.total },
    operands: { distinct: operands.values.size, total: operands.total },
    vocabulary, length, volume, difficulty, effort, time: effort / 18,
  };
}

function targetFiles(options) {
  if (options.files !== undefined) {
    const files = options.files.split(",").map(file => file.trim());
    if (files.some(file => !sourceExtension.test(file))) throw new Error("--files requires a comma-separated list of JS/TS source files.");
    return files;
  }
  if (options["git-changed"] || options["git-diff-base"] !== undefined) {
    return gitFiles(options["git-diff-base"], options.dir);
  }
  return directoryFiles(options.dir ?? ".");
}

function printMetrics(file, metrics) {
  process.stdout.write(`FILE: ${file}
  Operators (distinct/total): ${metrics.operators.distinct}/${metrics.operators.total}
  Operands (distinct/total): ${metrics.operands.distinct}/${metrics.operands.total}
  Vocabulary: ${metrics.vocabulary}
  Length: ${metrics.length}
  Volume: ${metrics.volume.toFixed(2)}
  Difficulty: ${metrics.difficulty.toFixed(2)}
  Effort: ${metrics.effort.toFixed(2)}
  Time to Implement: ${metrics.time.toFixed(2)} seconds\n`);
}

function main() {
  const { values } = parseArgs({ options: {
    dir: { type: "string" }, files: { type: "string" }, out: { type: "string" },
    "git-changed": { type: "boolean" }, "git-diff-base": { type: "string" },
  } });
  const files = targetFiles(values);
  const results = Object.create(null);
  if (!files.length) console.log("No valid JavaScript or TypeScript files identified for analysis.");
  for (const file of new Set(files)) {
    try {
      const metrics = metricsFor(file);
      results[file] = metrics;
      printMetrics(file, metrics);
    } catch (error) {
      process.stderr.write(`Failed to analyze ${file}: ${error.message}\n`);
      process.exitCode = 1;
    }
  }
  if (values.out !== undefined) {
    mkdirSync(path.dirname(values.out), { recursive: true });
    writeFileSync(values.out, `${JSON.stringify(results, null, 2)}\n`);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`Halstead analysis failed: ${error.message}\n`);
  process.exitCode = 1;
}
