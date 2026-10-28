# Learn evaluation

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
