# Learn evaluation

## Try a small benchmark

Promptfoo is the runner; the benchmark is the fixed set of ten cases in
[`examples.yaml`](examples.yaml), the actual `/learn` instruction body, and the
assertions in [`promptfooconfig.yaml`](promptfooconfig.yaml). Each case passes
only when all assertions pass. This is a small prompt-level decision benchmark,
not an end-to-end coding or OpenCode runtime benchmark.

From the repository root, use Node 22.22+ (22.x), npm 10, and install with `npm ci`.
Start with the **no-cost, offline demonstration**:

```sh
npm run eval:learn:demo
```

Open `.promptfoo/learn-calibration.html` in your browser. It shows the same ten
rows against two columns; open a failed cell's details to inspect its output and assertion.
The JSON report is at `.promptfoo/learn-calibration.json`. Both files stay local
and are overwritten on rerun; copy them elsewhere to preserve a run.

| Column | Expected passing cases | What produced the output |
| --- | --- | --- |
| synthetic-baseline | 7/10 | Expected-answer fixtures with three deliberately wrong decisions |
| synthetic-candidate | 10/10 | Expected-answer fixtures |

These are manufactured calibration results, **not measured model performance or
an improvement to `/learn`**. The built-in `echo` provider and local transforms
produce the outputs; no model or model judge is called. A network-blocking preload
also prevents outbound connections. The three failures (`failed-attempt`,
`inherited-paraphrase`, `stale-contradiction`) are intentional, so Promptfoo exits
**100**. The regression test checks both this failing run and an all-pass run.
Promptfoo's overall 17/20 (85%) combines both columns; compare the per-column
passing counts above. A failed cell can have a partial score such as 0.67 while
still failing the case.

## Optional real-model comparison

Only after separately authorizing provider charges, supply `OPENAI_API_KEY`
outside the repository and run:

```sh
LEARN_BASELINE_PROVIDER=openai:chat:gpt-4o \
LEARN_CANDIDATE_PROVIDER=openai:chat:gpt-4o-mini \
  npm run eval:learn:compare
```

This makes twenty candidate requests, ten per model, with no model judge. These
are also the default providers; the names baseline/candidate identify comparison
roles and do not predict which model will perform better. Both inherit the
existing temperature, output limit and JSON response settings. The real-model
config has no calibration transforms: only synthetic snapshots and current
command instructions reach the model, never expected answers or review notes.

Open `.promptfoo/learn-benchmark.html` to compare the baseline/candidate columns,
or run `npm run eval:learn:view` for the local Promptfoo results browser. JSON is
saved to `.promptfoo/learn-benchmark.json`; the live run also enters the local
database. Archive reports and record the repo commit, provider IDs and run date
when comparing later runs. Keep cases, assertions and instructions fixed and
change one variable at a time; this example changes only the model. Ten cases
give a useful regression signal, not a broad quality ranking. A passing count
does not establish the correctness of retained prose: also inspect outputs using
each case's `semantic_review` notes. Provider errors are not passes.

## Existing single-model evaluation

From the repository root, use Node 22.22+ (22.x), npm 10, and `npm ci`.
The live eval requires an authorized OpenAI API key supplied as `OPENAI_API_KEY`
outside the repository. It makes ten model requests and can incur provider charges;
there is no model judge. Do not run it without authorization to use that provider.

```sh
npm run eval:learn
```

The provider defaults to `openai:chat:gpt-4o`, matching the existing failure-reporting
eval. Change `providers` in `promptfooconfig.yaml` to compare another configured
model; see [Promptfoo's provider configuration](https://www.promptfoo.dev/docs/providers/openai/).
The prompt reads the actual [`commands/learn.md`](../../commands/learn.md) body on
each run, without copying its policy. Only the synthetic session, repository
evidence and existing guidance are sent; expected labels and review notes are not.

`examples.yaml` is the runnable Promptfoo test set. Assertions check JSON shape,
retain/skip labels, target scope, concise/nonempty retained text, null learning for
skips, and copying of synthetic sensitive markers. Correct decisions should pass
all ten cases; model mistakes fail assertions. Provider/setup errors are errors,
not successful decisions. No exact prose match is required.

Results are saved locally in `.promptfoo/learn.json`, `.promptfoo/learn.html` and
the Promptfoo database. Open the HTML file or run `npm run eval:learn:view` to inspect
outputs and assertion failures. Sharing and telemetry are disabled by the scripts.
Review the actual learning and reason against each case's `semantic_review` notes:
the automated checks do not fully judge factual support, private-data handling or
meaning. This text-only evaluation has no OpenCode tools or AGENTS.md writer, so it
does not establish runtime write safety or permission enforcement.

Separate offline regression and plumbing checks:

```sh
node --require ./evals/failure-reporting/offline.js --test tests/learn-command.test.mjs tests/learn-promptfoo.test.mjs
```

These invoke the actual Promptfoo CLI with the existing capture stub, clearly
hand-authored echo calibration, and a network-blocked provider failure. They check
prompt/case/assertion wiring and failure reporting, not model quality. No live or
paid model evaluation was run as part of this change.
