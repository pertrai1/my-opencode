# Review risk (proposed)

Use this rubric when preparing a PR, handing off completed changes, or reviewing
a change. It applies in the target repository through the globally loaded style
guide; no target-repository template is required. The author proposes an
assessment and the reviewer independently challenges it against the source.

The score is advisory: it is not approval, proof of safety, a guaranteed review
duration, or permission to commit, push, publish, merge, or deploy. Existing user
authorization, review gates, and specialist selection still apply.

## Evidence and scope

Inspect the actual diff and surrounding source before rating it. Name affected
behavior and consumers, including configuration and instructions that influence
other repositories. File count and line count alone do not establish reach or
consequence. Give brief evidence for each rating, reviewer focus, and verification
gaps; distinguish observations from assumptions.

For a PR or explicit base/head comparison, including branch names or tags without
a PR, assess the full scoped diff, including already committed changes, not merely
the working tree or last commit. Resolve and record the exact base and head SHAs;
if using a three-dot comparison, also record its merge-base SHA. For
an ordinary working-tree handoff or review, include staged, unstaged, and relevant
untracked changes, recording HEAD and the inspected snapshot (files and observation
time). Refresh after meaningful edits, new evidence, or base/head changes; an
assessment belongs to the recorded revisions, not permanently to the PR.

Reuse existing code-graph impact evidence before changing or reviewing shared
code. Check graph freshness against the assessed revisions and verify reported
callers/importers against source. A graph current at HEAD may still omit PR
changes or working-tree edits. If unavailable, stale, or incomplete, use source
search, imports, callers, configuration consumers, and tests as fallback and state
the remaining uncertainty. Missing graph evidence never means zero impact.

## Ratings

Rate each dimension from 0 to 2 and add them for a total from 0 to 6.

| Dimension | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Reach (R) | Bounded editorial change with no behavior or consumer contract change | Isolated behavior with known local consumers | Shared runtime, public contract, cross-repository instructions, many consumers, or unknown scope |
| Consequence (C) | Failure has negligible behavioral effect | Recoverable incorrect behavior or limited disruption | Serious harm: security boundary, credentials, destructive operation, migration/data integrity, or critical outage |
| Uncertainty (U) | Scope and behavior supported by inspected source and relevant verification | Some indirect consumers, assumptions, or verification gaps remain | Unknown scope, missing key evidence, or unresolved behavior/consumer ambiguity |

Unknown scope must receive R2 and U2, with the unknowns stated; do not guess a
low score. Rate consequence from plausible failure modes, not diff size or an
unverified claim of safety. A missing graph alone need not imply U2 if source
inspection establishes the relevant consumers; explain the fallback and limits.

## Proposed review budgets

| Total | Suggested review |
| --- | --- |
| 0–1 | quick, about 5 minutes |
| 2–3 | focused, about 10–20 minutes |
| 4–6 | deep, 30+ minutes |

High consequence (C2), security boundaries, credentials, destructive operations,
and migrations override the total to **deep** review. State the override even for
a tiny change. These are heuristic starting budgets for discussion; reviewers may
need more time or different specialists.

## Compact handoff

Use roughly five lines, with short evidence rather than a checklist of ceremony:

```text
Review risk (proposed): R1 + C1 + U1 = 3/6; focused (~10–20 min); override: none.
Scope: PR base <SHA> -> head <SHA> (merge-base <SHA> if used); or working-tree HEAD <SHA>, snapshot <files/time>.
Evidence: R1 <consumer evidence>; C1 <plausible failure>; U1 <known gaps>.
Impact: <affected behavior/consumers>; graph <freshness/source verification or fallback and uncertainty>.
Focus / gaps: <review priorities and missing verification>; advisory, not approval.
```

Reviewers use `Review risk (reviewer)` and add agreement or disagreement and the
reason within these lines. Compute an independent assessment before comparing the
author's ratings; do not inherit the author's score or use it to suppress findings.
If the author assessment is absent or stale, say so and assess the available scope.

## Validation boundary

Check arithmetic, ranges, budget/override consistency, and required fields
mechanically. Separately judge whether the evidence supports the ratings, whether
consumers or failure modes were missed, and whether uncertainty is honest. Passing
fixtures or format checks does not establish model judgment. See the lightweight
[Promptfoo examples](../../evals/review-risk/README.md) for this distinction.
