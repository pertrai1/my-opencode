# Promptfoo evidence adaptation eval

Promptfoo owns test selection, assertions, persistence, exports, and comparison.
The custom provider runs one bounded simulated-tool episode per test; the JavaScript
assertion replays its actions and validates the observed evidence. The standalone
Node runner has been removed. No model judge is used.

The six episodes cover incomplete test output, recovered completed output,
failed-tool discovery, stale-head CI, approval gating with independent progress,
and a two-action simple-task control. Tool contracts reject invalid arguments;
action budgets apply before inference; citations can reference any qualifying
observation. Invalid or prohibited attempts remain failures even after recovery.

## Run and compare

Use Node 22.22+ (22.x), npm 10, and `npm ci` from the repository root. Start an
already-installed tool-capable local model server at
`http://127.0.0.1:11434/v1/chat/completions`. It must run locally, not proxy a paid
provider. No models are downloaded or credentials loaded by this eval.

```sh
OODA_MODEL=YOUR_LOCAL_MODEL npm run eval:ooda -- \
  --description ooda-before -o .promptfoo/ooda-before.json

# After a separately scoped agent-prompt change, keep model and eval fixed:
OODA_MODEL=YOUR_LOCAL_MODEL npm run eval:ooda -- \
  --description ooda-after -o .promptfoo/ooda-after.json

npm run eval:ooda:view
```

In Promptfoo's viewer, select `ooda-after`, then **Eval actions → Compare** and
choose `ooda-before`. Inspect per-scenario traces, assertion reasons, and errors,
not just the aggregate score. Both runs are stored locally under ignored
`.promptfoo/`; sharing, telemetry, update checks, and result caching are disabled.
Use `--var agent=agents/another-agent.md` to select another agent body. To change
the local endpoint, edit the provider's `config.endpoint` in `promptfooconfig.mjs`.
Only credential-free loopback HTTP is allowed; redirects are rejected.

Outputs retain model responses and tool traces. Metadata records model, endpoint,
commit, dirty state, evaluated prompt hash, and source hashes for the adapter,
transport, tool contracts, harness, assertion, prompt loader, and config. Transport
or setup errors use Promptfoo's error channel, separate from behavioral assertion
failures. Promptfoo CLI exit codes apply (100 when evaluations fail or error).

## Offline regression and framework calibration

```sh
node --require ./evals/failure-reporting/offline.js --test tests/ooda-*.test.mjs
npm run eval:ooda:calibrate -- -o .promptfoo/ooda-calibration.json
```

Calibration intentionally exits **100**: six scripted passing traces, six scripted
adversarial failures, and six simulated transport errors. This checks framework
wiring and grader discrimination, **not agent performance**. The Node regression
test executes the real pinned Promptfoo CLI and asserts these exact results,
including structured outputs, citations, provenance, prompt loading, and nested
export paths. The existing network guard blocks all sockets and fetch calls;
a test-only transport supplies hand-authored responses. Calibration is not saved
to the viewer by the npm command, keeping it out of model comparisons.

## Measurement boundary

**Real model baseline not run:** no local model runtime/server was available during
implementation; no paid model or judge calls were made. This eval loads only the
selected agent Markdown body, strips front matter, and supplies simulated tools.
It does **not** run OpenCode or load skills, permissions, plugins, or orchestration.
It cannot measure skill-only changes. Free-text semantics and full-runtime transfer
remain unmeasured; scores apply only to these bounded tool-action fixtures.

API references: [custom providers](https://www.promptfoo.dev/docs/providers/custom-api/),
[JavaScript assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/javascript/),
and [viewer comparison](https://www.promptfoo.dev/docs/usage/web-ui/). Integration
is tested against the repository's pinned Promptfoo 0.124.1, not a downloaded latest CLI.
