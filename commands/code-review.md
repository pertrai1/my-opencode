---
description: Review the current diff for architectural fit and launch Difit with findings.
agent: plan
model: openai/gpt-5.6-terra
---

Review the current change set in the working tree.

This is a review-only task. Do not edit files, apply patches, or change the repository state.

First, answer this question while comparing the change to the surrounding code:

Does this change match the conventions, complexity level, and intent of the surrounding code?

Then decide whether the diff is performance-sensitive, or whether the user explicitly asked for performance review. Examples include rendering loops, data processing, database/query logic, network-heavy flows, caching, bundle/build configuration, hot paths, or clearly scalable code paths.

If yes, launch the `performance-reviewer` subagent and incorporate its findings into your review. If not, skip the subagent.

Then decide whether the diff changes architectural edges. Examples include imports, exports, package boundaries, file moves, shared utilities, layer crossings, public APIs, deep imports, or test code leaking into production code.

If yes, launch the `architecture-boundary-reviewer` subagent and incorporate its findings into your review. If not, skip the subagent.

Then decide whether the diff changes behavior without enough tests, or directly adds, removes, or modifies tests.

If yes, launch the `test-reviewer` subagent and incorporate its findings into your review. If not, skip the subagent.

Then decide whether the diff touches production-sensitive surfaces, or whether the user explicitly asked for a production-safety review. Examples include persistence, migrations, external services, auth, privacy, queues/jobs, deploy/config changes, critical paths, or cross-service compatibility.

If yes, launch the `production-readiness-reviewer` subagent and incorporate its findings into your review. If not, skip the subagent.

Then use the `difit-review` skill to perform a diff review of the current working tree diff, attach any findings as Difit comments, and launch Difit.

Focus on:

- behavioral regressions
- convention mismatches
- unnecessary complexity
- places where the implementation appears to diverge from nearby code intent
- architecture boundary risks when the subagent is used
- performance risks and optimization opportunities when the subagent is used
- test quality and coverage risks when the subagent is used
- production-safety and rollout risks when the subagent is used

If there are no findings, say so explicitly and still launch Difit for the diff.
