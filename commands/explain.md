---
description: Explain a finished change as an HTML report, then quiz the user on it before merge.
---

Help me understand a change I did not write by hand, so I can merge it with confidence. This command writes only the report files described below.

Scope: $ARGUMENTS

If scope is empty, use the current branch against its base branch, including staged, unstaged, and untracked files. Resolve the base in this order: the open pull request's target branch for the current branch (for example `gh pr view --json baseRefName`) when one exists, else `git symbolic-ref refs/remotes/origin/HEAD`; if neither resolves, inspect the available branches and ask.

## Inputs

Read the full change set, excluding this command's own output under `.agents/docs/explainers/` and prototype output under `.agents/prototypes/`, then the intent behind it when present: the active work item's `intent.md` and `progress.md`, any implementation notes (`implementation-notes.md` next to them), a spec, and the linked issue. Treat the diff and tests as the source of truth for what the code does, and the notes for why. Where they disagree, say so.

## Report

Write one self-contained HTML file to `.agents/docs/explainers/<branch-or-work-id>.html`. No external assets or scripts that fetch remote content. Include:

1. **What changed and why**, in plain language, grouped by behavior rather than by file.
2. **Decisions and deviations** taken from the implementation notes, each with the reason and the alternative not taken.
3. **Riskiest parts**: the places a reviewer should read the code themselves, with file and symbol references.
4. **What was verified**: the checks that ran and their results. State what was not run.
5. **Open questions** and anything that looks unfinished.

## Quiz

After the explanation, write a quiz to `.agents/docs/explainers/<branch-or-work-id>-quiz.html`, with the answers and explanations hidden until I answer each question.

- Five to eight questions that test understanding of behavior, edge cases, and failure modes of this change, not trivia about names or line counts.
- Each answer must be derivable from the change, and each explanation must point to the file or symbol that settles it.
- Mix of multiple choice and "what happens if..." scenarios.

## Finish

Report the two file paths and the riskiest items in a few lines. Do not merge, commit, or push. Treat a passed quiz as my signal to proceed, not as verification evidence; run `/verify` for that.
