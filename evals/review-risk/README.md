# Review-risk examples

The [canonical proposed rubric](../../docs/agents/review-risk.md) owns ratings and
budgets. `examples.yaml` contains five synthetic, hand-authored examples with
evidence, separate semantic review notes, and candidate five-line assessments.
They cover editorial docs, isolated behavior, shared runtime, a tiny authorization
change, and unknown scope. They are discussion cases, not measured model outputs.

Run the existing Promptfoo CLI offline from the repository root:

```sh
PROMPTFOO_DISABLE_TELEMETRY=1 PROMPTFOO_DISABLE_UPDATE=1 PROMPTFOO_CONFIG_DIR=.promptfoo \
  node --require ./evals/failure-reporting/offline.js \
  ./node_modules/promptfoo/dist/src/entrypoint.js eval \
  -c evals/review-risk/promptfooconfig.yaml \
  --no-cache --no-write --no-share --no-progress-bar \
  -o .promptfoo/review-risk-mechanics.json
node --test tests/review-risk.test.mjs
```

This configuration uses `echo` and the existing network-blocking preload. No
model, judge, credential, new runner, or live call is needed. `mechanics.mjs`
checks rating ranges, sum, budget/explicit override consistency, and required
fields. It cannot tell whether an override was omitted from the evidence, whether
a revision is real, or whether ratings and consumer claims are justified.

Review semantic judgment separately against the supplied evidence and
`semantic_review` notes: identify affected behavior/consumers, challenge the author
without inheriting their score, explain each rating, notice high-consequence
overrides even in tiny diffs, and preserve uncertainty for unknown/stale evidence.
Alternate ratings need evidence, not an exact-match penalty. A mechanically valid
but unjustified low score must still fail this separate review. The unit tests
include such a counterexample to make this boundary visible.

For future model comparisons, reuse these inputs and the actual canonical rubric
and command/style-guide instructions; keep model outputs separate from these
hand-authored candidates and record the prompt revisions. Use the existing
Promptfoo framework for any separately authorized model run. These offline
examples do not execute OpenCode, validate graph behavior, or establish model
judgment or review quality.
