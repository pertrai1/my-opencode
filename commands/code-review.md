---
description: Review a working-tree or PR diff for architectural fit, challenge review risk, and launch Difit with findings.
agent: plan
model: openai/gpt-6-astra
---

Review the current change set in the working tree, or the full PR diff when the
user supplies a PR or explicit base/head revisions.

This is a review-only task. Do not edit files, apply patches, or change the repository state.

## Scope and independent risk assessment

For a PR, resolve and record the exact base and head SHAs and inspect the full
base-to-head PR diff, including committed changes. Record the merge-base SHA when
using a three-dot comparison. Do not substitute the local working-tree diff or
last commit. If the full diff or revisions cannot be obtained, report the missing
scope and uncertainty rather than claiming a complete PR review.

For an ordinary working-tree review, retain staged, unstaged, and relevant
untracked changes; record HEAD and the files/time of the inspected snapshot.
Read the shared [proposed review-risk rubric](~/.config/opencode/docs/agents/review-risk.md).
Independently assess reach, consequence, and uncertainty from source and impact
evidence, then compare with the author's assessment. Report agreement or
disagreement with reasons, including an absent or stale author assessment. Refresh
after meaningful changes or revision updates. The score does not replace findings,
specialist selection, or human validation, and grants no publication permission.

Reuse graph impact/review evidence only when it covers the assessed revisions;
verify it against source. If missing, stale, or incomplete, inspect source and
consumers directly and state uncertainty; missing evidence never means zero impact.

## Reviewer selection

The selector below reads working-tree metadata only. For PR or explicit
base/head reviews, skip it and apply the existing manual rules to the full scoped
diff. A clean working tree must not suppress PR reviewers. For working-tree
reviews, retain the selector behavior below.

The router sends working-tree file statuses (including paths), diff statistics,
and locally derived file-category counts to the selected reviewer provider, not raw diffs or credentials.
Paths can contain sensitive identifiers. If that metadata may leave the machine,
run `node ~/.config/opencode/scripts/recommend-reviewers.mjs`. Otherwise, skip the
router and use manual selection. `REVIEWER_DECISION_PROVIDER` selects `off`, `jev`
(the unchanged default), or `subq`. `off` makes no provider call. SubQ currently
requires an injected, approved transport and otherwise returns fallback; see
[reviewer provider setup](../docs/reviewer-decision-providers.md). No provider
silently fails over to another. This selector does not affect agent/model routing.

Build one reviewer set:

- For `source: typesafe` or `source: subq`, include every `selectedReviewers` entry, including uncertain recommendations.
- If routing was skipped, or for `source: fallback` or `source: none`, start with an empty set and use the manual rules below.
- Inspect the scoped diff and add reviewers required by the manual rules or the user's explicit request. Do not remove a router-selected reviewer because your own classification differs.
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
- the exact assessed scope/revisions and the full relevant diff, so a PR reviewer does not default to working-tree changes

Then answer this question while comparing the change to the surrounding code:

Does this change match the conventions, complexity level, and intent of the surrounding code?

Then use the `difit-review` skill to review the same scoped diff, attach findings
as local Difit comments, and launch Difit. For a PR or revision comparison, pass
the assessed revisions or PR URL supported by the installed viewer. If that view
is unavailable, report the limitation; do not display a working-tree diff as the
PR review. Do not post remote comments or publish changes as part of this command.

In your final synthesis:

- summarize the overall review in 2-3 sentences
- include the compact independent review-risk assessment, assessed revisions, and any disagreement with the author's score
- group specialist findings by domain or risk area when that improves clarity
- deduplicate overlapping findings from multiple reviewers
- produce a clear overall verdict on whether the change looks ready, needs changes, or needs discussion

Focus on evidence-backed regressions, convention mismatches, unnecessary
complexity, divergence from the surrounding code's intent, and the selected
specialists' findings. Keep required human validation visible.

If there are no findings, say so explicitly and still launch Difit for the diff.
