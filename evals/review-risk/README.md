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

## Optional model evaluation

`model.yaml` generates an independent assessment for each of the five evidence
scenarios and a shared-display-label boundary case: R2/C0/U0 needs focused review,
not automatically deep. It loads the actual canonical rubric and the **Scope and
independent risk assessment** section of `commands/code-review.md` at run time.
Generation receives only evidence; hand-authored candidates are excluded and
`semantic_review` notes go only to the grader's assertion. Mechanics and an
`llm-rubric` assertion must both pass. Semantic grading checks evidence, overrides,
consumer claims and uncertainty, allowing justified rating variation.

This command makes paid generation and grading calls using your configured
`OPENAI_API_KEY`. Check both explicit provider IDs and completion budgets in
`model.yaml` before running; model access depends on your account. The configured
API snapshots are [GPT-5.4 Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
for generation and [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4)
for grading. Each has an 8,000-token completion budget including reasoning.

```sh
PROMPTFOO_DISABLE_TELEMETRY=1 PROMPTFOO_DISABLE_UPDATE=1 PROMPTFOO_CONFIG_DIR=.promptfoo \
  ./node_modules/.bin/promptfoo eval -c evals/review-risk/model.yaml \
  --no-cache --no-write --no-share --no-progress-bar \
  -o .promptfoo/review-risk-model.json .promptfoo/review-risk-model.html
```

Keep `git rev-parse HEAD` and any local diff of `evals/review-risk/`,
`docs/agents/review-risk.md` and `commands/code-review.md` with your results.
Those identify the evaluation instructions, not the scenario's inspected
revisions. The scenarios supply no real revision IDs; assessments must state that
limit rather than copying placeholder SHAs from the offline examples.

After changing instructions, cases or configuration, run:

```sh
node --test tests/review-risk.test.mjs tests/review-risk-model.test.mjs
```

The model wiring test uses the pinned Promptfoo 0.124.1 CLI with controlled local
outputs and network blocked. It checks canonical instructions, evidence/criteria
separation, and independent mechanical/semantic result aggregation. Scripted
grader responses establish wiring only, not semantic grader accuracy. No live
model quality is established by these tests. Neither eval executes OpenCode or
validates real repository inspection, graph behavior, or end-to-end review quality.
