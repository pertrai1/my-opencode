# Maintain the reviewer baseline

Use the reviewer baseline to improve two different outcomes: **which specialist reviewers are launched** and **whether those reviewers produce useful, evidence-backed findings**. Keep these measurements separate. A correct routing choice does not establish review quality, and a good review does not excuse a missed reviewer on another change.

## Current reference and limits

- [`reviewer-router-baseline.md`](reviewer-router-baseline.md) is the initial TypeSafe routing snapshot. Preserve it as a reference; it includes eight historical commits and two synthetic cases, with one case containing disputed labels.
- [`../tests/fixtures/reviewer-router-baseline.json`](../tests/fixtures/reviewer-router-baseline.json) holds the expected and disputed reviewer labels and their rationales. [`../scripts/baseline-reviewer-router.mjs`](../scripts/baseline-reviewer-router.mjs) reconstructs the router's metadata for each case and calls the existing routing function.
- The runner reports selected reviewers, per-reviewer misses and unnecessary selections, mean latency, usage, fallback count, fixture and question hashes, and resolved model. It does **not** retain the six probabilities for each case, evaluate which reviewers `/code-review` ultimately launched, or measure the quality of specialist findings. Those are follow-up capabilities, not properties of the current snapshot.
- Synthetic cases probe behavior but are not evidence of performance on actual changes in a target repository. The single labeled performance case and synthetic-only browser-interface case are insufficient for general performance or accessibility conclusions.

## Collect new cases

After a real `/code-review` involving a relevant or surprising routing decision, select a representative change and record its exact revision, target repository, and the **metadata the router would see**. The current runner accepts commits reachable from this repository or inline synthetic metadata; evaluating external repositories requires a documented fixture or runner extension rather than putting an unreachable commit hash in the existing fixture file.

Before looking at router predictions for that case, have a reviewer inspect the source diff and independently label each of the six specialist roles as needed, not needed, or disputed. Record a brief, source-grounded reason for each positive or disputed label. Include clean negatives as well as difficult positives, and collect real browser-facing work, plugin removals, external-service changes, and performance-sensitive paths. Review file paths and metadata before sending them to TypeSafe; the current router sends paths and diff statistics, not raw diff content.

Keep disputed labels out of accuracy denominators until resolved. Do not turn a router prediction into its own ground truth. When the labeled set grows, reserve newly collected cases for a fresh check before using them to tune questions or thresholds.

## Preserve and compare snapshots

From this repository, with `TYPESAFE_API_KEY` available, run the current replay into a **new** file instead of overwriting the reference snapshot:

```sh
node scripts/baseline-reviewer-router.mjs > docs/reviewer-router-replay-YYYY-MM-DD.md
```

Replace `YYYY-MM-DD` with the run date and use a distinct suffix if there is more than one run that day. A replay makes live TypeSafe calls; its timings and answers can vary. Record the reason for the replay, the router revision, any fixture or label changes, and whether the model version, question hash, or policy changed. The report records the fixture hash and the resolved model. Keep an unchanged fixture set when comparing a proposed router with the current one, then evaluate on the reserved new cases. Separate changes in labels or sample composition from changes in router behavior.

Compare **per reviewer**:

- Missed relevant launches and unnecessary launches, with their positive and negative denominators.
- Actual specialist launches in `/code-review`, including manual selection, explicit user requests, and fallback behavior. The existing replay measures router recommendations only.
- End-to-end routing latency, TypeSafe token usage and cost, and fallbacks. Distinguish a failed call from an ordinary negative prediction.
- The specific cases that improved or regressed, not just aggregate totals. Prioritize consequential misses while watching the cost of additional read-only reviews.

Do not lower the shared `0.35` effective launch threshold based only on the initial snapshot. First capture case-level probabilities and expand the labeled set; test reviewer-specific changes against both established and reserved cases.

## Improve specialist review quality

For a sampled set of actual launches, save the scoped review request, review findings, source locations, and eventual disposition. Have an independent reviewer check whether each finding is reproducible, correctly scoped, appropriately prioritized, and actionable. Sample changes the router did **not** send to a specialist to look for important missed findings. Record useful findings, unsupported findings, significant omissions, and the time and model cost of each specialist review separately from routing metrics.

If routing is correct but findings are weak, revise the relevant `agents/*-reviewer.md` guidance or the evidence passed in `commands/code-review.md`, then compare the same cases and new held-out cases. If findings are strong but the specialist is not launched, investigate the router's evidence and selection policy instead. Keep specialist agents read-only and retain the human's review decision.

## Change discipline

Make one measurable improvement at a time: state the observed failure, the proposed change, and what counts as improvement or regression. Record the before/after comparison and any disputed judgments. Use an OpenSpec change when the work alters a durable routing rule, the data sent to TypeSafe, the `/code-review` workflow, or a specialist agent's review contract. Preserve prior snapshots so model or policy updates do not erase the comparison point.
