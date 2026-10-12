---
description: Review the current diff for architectural fit and launch Difit with findings.
agent: plan
model: openai/gpt-6-astra
---

Review the current change set in the working tree.

This is a review-only task. Do not edit files, apply patches, or change the repository state.

The router sends working-tree file statuses (including paths), diff statistics,
and locally derived file-category counts to TypeSafe, not raw diffs or credentials.
Paths can contain sensitive identifiers. If that metadata may leave the machine,
run `node ~/.config/opencode/scripts/recommend-reviewers.mjs`. Otherwise, skip the
router and use manual selection.

Build one reviewer set:

- For `source: typesafe`, include every `selectedReviewers` entry, including uncertain recommendations.
- If routing was skipped, or for `source: fallback` or `source: none`, start with an empty set and use the manual rules below.
- Inspect the working-tree diff and add reviewers required by the manual rules or the user's explicit request. Do not remove a router-selected reviewer because your own classification differs.
- Launch each selected reviewer once, in parallel where possible.

## Manual reviewer selection

| Reviewer | Select for |
| --- | --- |
| `architecture-boundary-reviewer` | Imports, exports, package or layer boundaries, file moves, shared utilities, public APIs, deep imports, or test code leaking into production. |
| `performance-reviewer` | Rendering loops, data processing, database queries, network-heavy paths, caching, bundle/build changes, scalable paths, or an explicit performance review request. |
| `test-reviewer` | Behavior changes that need coverage review, or added, removed, or modified tests. |
| `production-readiness-reviewer` | Persistence, migrations, external services, auth, privacy, async jobs, deployment/configuration, critical paths, cross-service compatibility, or an explicit production-safety review request. |
| `security-audit-reviewer` | Authentication, authorization, untrusted input, secrets, sensitive data, cryptography, external requests, dependencies, security configuration, or an explicit security review request. Use the `security-audit` skill in guidance mode, not a full audit. |
| `frontend-a11y-reviewer` | Browser-facing components, forms, navigation, rendering, visual presentation, interactions, or an explicit accessibility review request. |

## Review and synthesis

If JSCPD is available in the current repository and the diff adds or substantially modifies production code across multiple files or modules, run its AI reporter and use the results as investigation leads for possible duplication, missed reuse, or poor ownership boundaries. Do not treat every clone report as an automatic finding.

When invoking a specialist reviewer, pass:

- the specific files or file groups that are relevant to that reviewer
- a brief summary of the change area
- any explicit risk focus that caused you to invoke that reviewer

Then answer this question while comparing the change to the surrounding code:

Does this change match the conventions, complexity level, and intent of the surrounding code?

Then use the `difit-review` skill to perform a diff review of the current working tree diff, attach any findings as Difit comments, and launch Difit.

In your final synthesis:

- summarize the overall review in 2-3 sentences
- group specialist findings by domain or risk area when that improves clarity
- deduplicate overlapping findings from multiple reviewers
- produce a clear overall verdict on whether the change looks ready, needs changes, or needs discussion

Focus on evidence-backed regressions, convention mismatches, unnecessary
complexity, divergence from the surrounding code's intent, and the selected
specialists' findings. Keep required human validation visible.

If there are no findings, say so explicitly and still launch Difit for the diff.
