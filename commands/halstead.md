---
description: Run the Halstead analyzer on changed files, a branch diff, a directory, or an explicit file list.
agent: general
model: openai/gpt-5.4
---

Run the Halstead analyzer script and summarize the results.

Interpret `$ARGUMENTS` like this:

- If no arguments are provided, run `node ~/.config/opencode/scripts/halstead-analyzer.js --git-changed`.
- If the argument is `changed`, run `node ~/.config/opencode/scripts/halstead-analyzer.js --git-changed`.
- If the argument starts with `branch `, treat the rest as the base ref and run `node ~/.config/opencode/scripts/halstead-analyzer.js --git-diff-base <base-ref>`.
- If the argument starts with `dir `, treat the rest as the directory path and run `node ~/.config/opencode/scripts/halstead-analyzer.js --dir <dir>`.
- If the argument starts with `files `, treat the rest as the comma-separated file list and run `node ~/.config/opencode/scripts/halstead-analyzer.js --files <files>`.
- If the argument starts with `raw `, pass the rest straight through to `node ~/.config/opencode/scripts/halstead-analyzer.js`.

After running the command:

1. Report the exact analyzer command you ran.
2. Summarize which files were analyzed.
3. Call out the highest Halstead difficulty and highest Halstead volume files.
4. Flag any file that looks unusually complex relative to the others in this run.
5. If the analyzer reports no matching files, say so plainly.
6. If the analyzer fails for a file, include that failure in the summary instead of pretending the file was analyzed successfully.

Keep the response concise and evidence-based.
