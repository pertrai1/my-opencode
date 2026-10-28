# Learn evaluation

## Compare prompt versions

Promptfoo runs the benchmark: ten fixed cases from `examples.yaml` and the
existing assertions from `promptfooconfig.yaml`. `benchmark.mjs` snapshots
`commands/learn.md` at `origin/main` (baseline) and in the working copy (candidate),
then runs both through the same prompt renderer and one model. Set
`LEARN_BASELINE_REF` to a commit/ref for a different baseline; it resolves once to
an exact commit. The report records that SHA and the working-copy SHA-256 hash.

Use Node 22.22+ (22.x), npm 10 and `npm ci`. After separately authorizing provider
charges and supplying `OPENAI_API_KEY` outside the repository:

```sh
git fetch origin main
export LEARN_BENCHMARK_PROVIDER='openai:chat:YOUR_VERIFIED_API_MODEL_ID'
export LEARN_BENCHMARK_REASONING_EFFORT=high
LEARN_BASELINE_REF=origin/main npm run eval:learn:compare -- --repeat 3
```

Replace the provider placeholder with an API model ID you have verified. There
is no model default or automatic translation from OpenCode's `provider/model#effort`
names: the repo's global model and `lean` agent override differ. Both settings
are required and reject blank values. The pinned OpenAI chat provider uses
`reasoning_effort`; choose an effort supported by your model. The benchmark keeps
the original JSON format and temperature settings, but sets its own
`max_completion_tokens: 25000` and removes inherited `max_tokens`. This budget
covers reasoning plus visible output, giving reasoning models more room than the
single-model eval's unchanged 600-token setting. Promptfoo applies the selected
model's API restrictions (reasoning models may omit temperature).

Three repeats mean 60 case requests (two prompts × ten cases × three), without
a model judge. At this cap those requests could consume up to 1.5 million
completion tokens, plus input tokens; provider retries can add usage. The cap is
a ceiling, not expected usage, and increases potential cost. It does not guarantee
complete JSON: inspect finish reasons and token usage before treating incomplete
output as a prompt regression. No live truncation has been observed or measured.
Open `.promptfoo/learn-benchmark.html`, inspect the JSON alongside
it, or run `npm run eval:learn:view`. Compare each case's decision, scope and
pass/fail across repeats, including regressions and inconsistent answers, before
comparing totals. Each case passes only if all assertions pass; provider errors
are not passes. Keep cases, assertions, model and settings fixed while editing
the prompt. Archive reports before rerunning and record the repo commit/settings.

This small prompt-level benchmark cannot establish improvement from a one- or
two-case gap. Review retained prose and reasons against each case's
`semantic_review` notes: automated checks do not fully judge meaning or evidence.
It does not test end-to-end coding, OpenCode tools, file writes or permissions.
No live model comparison has been run. Offline CLI wiring tests use the existing
capture stub; their placeholder failures are not model performance results.

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
