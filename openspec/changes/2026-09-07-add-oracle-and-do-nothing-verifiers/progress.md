# Progress: Add Oracle and Do-Nothing Verifiers

## Target Workspace
- Path: `/tmp/my-opencode`
- Branch: `feature/issue-36-oracle-and-do-nothing-verifiers`
- Linked Issue: #36

## Decisions & Conventions
- Pre-flight Oracle baseline checks prevent false negatives by capturing the existing check status of the workspace before introducing edits.
- "Do-Nothing" anti-vacuous checks require proving that new tests or functional checks fail on the baseline workspace before accepting them as proof of completion.
- Reviewer agents (`test-reviewer`) must explicitly evaluate test diffs for tautologies and mock-leakage.

## Slices & Tasks
- [x] Task 1: OpenSpec change artifacts (proposal, design, tasks, intent, progress) <!-- id: task-prep -->
- [ ] Task 2: Update `agents/change-verifier.md` <!-- id: task-1 -->
- [ ] Task 3: Update `agents/test-reviewer.md` <!-- id: task-2 -->
- [ ] Task 4: Update `agents/tdd-orchestrator.md` <!-- id: task-3 -->
- [ ] Task 5: Update `.agents/docs/verification/README.md` & `README.md` <!-- id: task-4 -->
- [ ] Task 6: Repository verification (lint, typecheck, tests) <!-- id: task-5 -->
- [ ] Task 7: Pull Request creation <!-- id: task-6 -->
