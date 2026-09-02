#!/usr/bin/env node

/**
 * Halstead Metrics Analyzer (Zero-Install Edition)
 *
 * USAGE EXAMPLES:
 * 1. Analyze a specific directory structure recursively:
 *    node halstead-analyzer.js --dir ./src
 *
 * 2. Analyze specific individual target files:
 *    node halstead-analyzer.js --files ./src/index.js,./src/utils/math.ts
 *
 * 3. Run default project detection (fallback to current directory):
 *    node halstead-analyzer.js
 *
 * 4. Analyze only git-changed files in the current worktree:
 *    node halstead-analyzer.js --git-changed
 *
 * 5. Analyze files changed on the current branch relative to a base ref:
 *    node halstead-analyzer.js --git-diff-base main
 *
 * 6. Export metrics report to a JSON file:
 *    node halstead-analyzer.js --dir ./src --out ./report.json
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function writeStdout(message) {
  process.stdout.write(`${message}\n`);
}

function writeStderr(message) {
  process.stderr.write(`${message}\n`);
}

// --- Helper: Parse CLI Arguments ---
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    dir: null,
    files: null,
    out: null,
    gitChanged: false,
    gitDiffBase: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dir" && args[i + 1]) {
      config.dir = args[i + 1];
      i++;
    } else if (args[i] === "--files" && args[i + 1]) {
      config.files = args[i + 1].split(",").map((f) => f.trim());
      i++;
    } else if (args[i] === "--out" && args[i + 1]) {
      config.out = args[i + 1];
      i++;
    } else if (args[i] === "--git-changed") {
      config.gitChanged = true;
    } else if (args[i] === "--git-diff-base" && args[i + 1]) {
      config.gitDiffBase = args[i + 1];
      i++;
    }
  }
  return config;
}

// --- Helper: Recursively find JS/TS files in a directory ---
function getFilesFromDir(dirPath, fileList = []) {
  if (!fs.existsSync(dirPath)) {
    writeStderr(`Error: Directory does not exist -> ${dirPath}`);
    return fileList;
  }

  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Exclude common build/dependency artifacts to avoid pollution
      if (file !== "node_modules" && file !== "dist" && file !== "build") {
        getFilesFromDir(filePath, fileList);
      }
    } else if (/\.(js|jsx|ts|tsx)$/.test(file)) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

function getChangedFilesFromGit(dirPath = null) {
  try {
    const rawStatus = execFileSync("git", ["status", "--porcelain", "-z"], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    const changedFiles = rawStatus
      .split("\0")
      .filter(Boolean)
      .map((line) => {
        const statusPayload = line.slice(3);

        if (statusPayload.includes(" -> ")) {
          return statusPayload.split(" -> ").at(-1);
        }

        return statusPayload;
      });

    return filterTargetFiles(changedFiles, dirPath);
  } catch {
    writeStderr("Error: Failed to read git-changed files from the current worktree.");
    return [];
  }
}

function filterTargetFiles(files, dirPath = null) {
  const targetFiles = files
    .filter((file) => /\.(js|jsx|ts|tsx)$/.test(file))
    .filter((file) => fs.existsSync(file));

  if (!dirPath) {
    return targetFiles;
  }

  const resolvedDir = path.resolve(dirPath);

  return targetFiles.filter((file) => {
    const resolvedFile = path.resolve(file);

    return (
      resolvedFile.startsWith(`${resolvedDir}${path.sep}`) ||
      resolvedFile === resolvedDir
    );
  });
}

function getChangedFilesFromGitDiffBase(baseRef, dirPath = null) {
  try {
    const mergeBase = execFileSync("git", ["merge-base", "HEAD", baseRef], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    const rawDiff = execFileSync(
      "git",
      ["diff", "--name-only", "--diff-filter=ACMR", "-z", `${mergeBase}...HEAD`],
      {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      },
    );

    return filterTargetFiles(
      rawDiff.split("\0").filter(Boolean),
      dirPath,
    );
  } catch {
    writeStderr("Error: Failed to read branch-vs-base changed files.");
    return [];
  }
}

// --- Helper: Print breakdown metrics cleanly ---
function printHalsteadMetrics(filePath, halsteadData) {
  writeStdout(`\n==================================================`);
  writeStdout(` FILE: ${filePath}`);
  writeStdout(`==================================================`);

  if (!halsteadData) {
    writeStdout(` ⚠️ Could not extract Halstead data for this file.`);
    return;
  }

  writeStdout(
    ` 🔢 Distinct Operators (n1) : ${halsteadData.operators.distinct}`,
  );
  writeStdout(
    ` 🔢 Distinct Operands  (n2) : ${halsteadData.operands.distinct}`,
  );
  writeStdout(` ➕ Total Operators    (N1) : ${halsteadData.operators.total}`);
  writeStdout(` ➕ Total Operands     (N2) : ${halsteadData.operands.total}`);
  writeStdout(`--------------------------------------------------`);
  writeStdout(` 🎯 Vocabulary         (n)  : ${halsteadData.vocabulary}`);
  writeStdout(` 📐 Length             (N)  : ${halsteadData.length}`);
  writeStdout(
    ` 📦 Volume             (V)  : ${halsteadData.volume.toFixed(2)}`,
  );
  writeStdout(
    ` 🧠 Difficulty         (D)  : ${halsteadData.difficulty.toFixed(2)} 🔥`,
  );
  writeStdout(
    ` ⚡ Effort             (E)  : ${halsteadData.effort.toFixed(2)}`,
  );
  writeStdout(
    ` ⏱️ Time to Implement   (T)  : ${halsteadData.time.toFixed(2)} seconds`,
  );
}

function getTargetFiles(options) {
  if (options.files) {
    writeStdout(`Parsing explicitly provided files list...`);
    return options.files.filter((f) => fs.existsSync(f));
  }

  if (options.gitDiffBase) {
    writeStdout(`Scanning branch changes relative to base ref: ${options.gitDiffBase}...`);
    return getChangedFilesFromGitDiffBase(options.gitDiffBase, options.dir);
  }

  if (options.gitChanged) {
    writeStdout(`Scanning git-changed files...`);
    return getChangedFilesFromGit(options.dir);
  }

  if (options.dir) {
    writeStdout(`Scanning directory: ${options.dir}...`);
    return getFilesFromDir(options.dir);
  }

  writeStdout(`No flags passed. Defaulting to scanning current directory...`);
  return getFilesFromDir(process.cwd());
}

// --- Main Execution Orchestrator ---
function main() {
  const options = parseArgs();
  const targetFiles = getTargetFiles(options);
  const resultsLog = {};
  let hadAnalysisFailure = false;

  if (targetFiles.length === 0) {
    writeStdout(
      "No valid JavaScript or TypeScript files identified for analysis.",
    );
    process.exit(0);
  }

  writeStdout(
    `Found ${targetFiles.length} files to calculate. Preparing npx environment...`,
  );

  // 2. Loop and generate metrics payload via isolated npx executions
  targetFiles.forEach((file) => {
    try {
      // Execute typhonjs-escomplex via npx -y, requesting a raw JSON dump string
      // We pass the file path directly to the CLI tool
      const rawCommandOutput = execFileSync(
        "npx",
        ["-y", "typhonjs-escomplex", "-f", file, "--json"],
        {
          encoding: "utf8",
          stdio: ["pipe", "pipe", "ignore"], // Suppress stderr parsing noise
        },
      );

      const report = JSON.parse(rawCommandOutput);

      // Halstead parameters sit directly on the root aggregate file block
      if (report?.aggregate?.halstead) {
        // Log results internally for console display
        printHalsteadMetrics(file, report.aggregate.halstead);

        // Save to structured object for possible file export
        resultsLog[file] = report.aggregate.halstead;
      } else {
        writeStderr(
          `⚠️ Syntax analyzed successfully but no metrics generated for: ${file}`,
        );
        hadAnalysisFailure = true;
      }
    } catch {
      writeStderr(`❌ Failed to parse code syntax structure in: ${file}`);
      writeStderr(
        `   Reason: Make sure the file contains valid JS/TS or isn't empty.`,
      );
      hadAnalysisFailure = true;
    }
  });

  // 3. Write out to JSON file if argument is supplied
  if (options.out) {
    try {
      const outputPath = path.resolve(options.out);
      const outputDir = path.dirname(outputPath);

      // Ensure target folder structure exists before saving
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(outputPath, JSON.stringify(resultsLog, null, 2), "utf8");
      writeStdout(
        `\n💾 Successfully exported full Halstead metrics to: ${outputPath}`,
      );
    } catch (error) {
      writeStderr(`\n❌ Failed to write JSON output dump file.`);
      writeStderr(`   Reason: ${error.message}`);
      process.exit(1);
    }
  }

  if (hadAnalysisFailure) {
    process.exitCode = 1;
  }
}

main();
