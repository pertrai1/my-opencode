---
description: Review the current diff for architectural fit and launch Difit with findings.
agent: plan
model: openai/gpt-5.6-terra
---

Review the current change set in the working tree.

This is a review-only task. Do not edit files, apply patches, or change the repository state.

First, inspect the working-tree diff and categorize the touched files so you understand which parts of the system changed.

Useful categories include:

- frontend: `.ts`, `.js`, `.tsx`, `.jsx` client-side styles, UI components, browser-facing state or rendering code
- backend: APIs, services, domain logic, persistence, queues/jobs, migrations, server-side TypeScript/JavaScript/Python/Go/Java code
- devops/config: Docker, CI, deployment config, infrastructure, environment wiring, workflow files
- shared/core: package boundaries, shared utilities, public APIs, cross-cutting libraries

Use the category map to decide which specialist reviewers are relevant. If a specialist is not relevant, skip it. If multiple specialists are relevant, launch them in parallel after classification.

If JSCPD is available in the current repository and the diff adds or substantially modifies production code across multiple files or modules, run its AI reporter and use the results as investigation leads for possible duplication, missed reuse, or poor ownership boundaries. Do not treat every clone report as an automatic finding.

When invoking a specialist reviewer, pass:

- the specific files or file groups that are relevant to that reviewer
- a brief summary of the change area
- any explicit risk focus that caused you to invoke that reviewer

Then answer this question while comparing the change to the surrounding code:

Does this change match the conventions, complexity level, and intent of the surrounding code?

Then decide whether the diff is performance-sensitive, or whether the user explicitly asked for performance review. Examples include rendering loops, data processing, database/query logic, network-heavy flows, caching, bundle/build configuration, hot paths, or clearly scalable code paths.

If yes, launch the `performance-reviewer` subagent, scoped to the relevant changed files, and incorporate its findings into your review. If not, skip the subagent.

Then decide whether the diff changes architectural edges. Examples include imports, exports, package boundaries, file moves, shared utilities, layer crossings, public APIs, deep imports, or test code leaking into production code.

If yes, launch the `architecture-boundary-reviewer` subagent, scoped to the relevant changed files, and incorporate its findings into your review. If not, skip the subagent.

Then decide whether the diff changes behavior without enough tests, or directly adds, removes, or modifies tests.

If yes, launch the `test-reviewer` subagent, scoped to the relevant changed files, and incorporate its findings into your review. If not, skip the subagent.

Then decide whether the diff touches production-sensitive surfaces, or whether the user explicitly asked for a production-safety review. Examples include persistence, migrations, external services, auth, privacy, queues/jobs, deploy/config changes, critical paths, or cross-service compatibility.

If yes, launch the `production-readiness-reviewer` subagent, scoped to the relevant changed files, and incorporate its findings into your review. If not, skip the subagent.

Then use the `difit-review` skill to perform a diff review of the current working tree diff, attach any findings as Difit comments, and launch Difit.

In your final synthesis:

- summarize the overall review in 2-3 sentences
- group specialist findings by domain or risk area when that improves clarity
- deduplicate overlapping findings from multiple reviewers
- produce a clear overall verdict on whether the change looks ready, needs changes, or needs discussion

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
