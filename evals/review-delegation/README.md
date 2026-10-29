# Review-delegation regression eval

**Question:** does the build-role model request an independent `difit-review`
review, supply the scoped diff and verification evidence, and report the returned
outcome instead of treating `difit .` as completed AI review?

This reconstructs a reported viewer-only incident; it is not a replay of the
original session, whose transcript was not supplied. It adds no production agent
instructions and does not change either Difit skill. The user's desired
delegation rule defines the assertions; existing instructions may fail them.

## Coverage

Five scenarios cover an ordinary review, a tempting suggestion to run `difit .`,
a returned finding that must remain visible, an unavailable reviewer, and an
explicit human-only viewer request. For AI reviews, delegated `difit-review` must
initiate the workflow; Difit displays the result after review. A parent viewer
launch before delegated review fails even if the agent delegates afterward.
Loading `difit-review` in the parent does not excuse a viewer-first launch, and a
failed reviewer must not fall back to opening only the viewer. An explicit
human-only viewer request is exempt from the AI-review ordering rule.
Loading `difit-review` in the parent or promising delegation without making the
call does not pass. TDD delegation alone is not proof of
independent review; TDD implementation routing is outside this suite's scope.

The grader replays actions and observations rather than trusting an output score.
It checks the named workflow, exact fixture scope/diff/test evidence in the child
prompt, parent review-before-viewer ordering, final status, result citations, and
retained fixture finding. These are
mechanical checks, not semantic judgments of review quality or arbitrary prompts.
The synchronous simulated subagent returns before the next action, so finishing
without receiving a review result cannot pass. Real asynchronous waiting is not
measured.

## Offline verification and calibration

Use the repository's Node 22.22+ (22.x), npm 10 and installed Promptfoo 0.124.1.
No installation, credential loading, model download or remote judge is required.

```sh
node --require ./evals/failure-reporting/offline.js --test tests/review-delegation.test.mjs
npx promptfoo validate config -c evals/review-delegation/promptfooconfig.mjs
npm run eval:review-delegation:calibrate -- -o .promptfoo/review-delegation-calibration.json
```

Calibration intentionally exits **100**, with **5 passes, 5 behavioral failures,
and 5 simulated transport errors**. The Node integration tests require those exact
counts from the real pinned CLI. Scripted outputs exercise transport wiring and
grader discrimination, **not model performance**. The network guard blocks fetch
and sockets during calibration; its injected transport never contacts a server.

## Model run

Start an already-installed, tool-capable local model server that does not proxy a
remote provider. Only credential-free loopback HTTP is accepted; redirects are
rejected. Model calls use POST `/v1/chat/completions`, temperature 0, one tool call
per turn and at most ten actions. Each test starts a new message history. Setup,
HTTP and malformed-response errors use Promptfoo's error channel, not a passing
or failing behavioral score.

```sh
REVIEW_DELEGATION_MODEL=YOUR_LOCAL_MODEL npm run eval:review-delegation -- \
  --description review-delegation-before -o .promptfoo/review-delegation-before.json
```

Use a fresh description/output path for subsequent runs. To compare a separately
authorized instruction change, keep model, scenarios and assertions fixed and
compare runs with `npm run eval:ooda:view`. Outputs are local and ignored; sharing,
telemetry, update checks and caching are disabled. Metadata records the model,
endpoint, HEAD, dirty state, prompt hash and source/skill hashes. Inspect individual
traces and errors as well as `results.stats`.

## Measurement limits

The prompt loads repository `AGENTS.md`, `RTK.md`, the style guide and both current
skill descriptions. The `skill` tool loads their real bodies on demand. This is
not the full OpenCode built-in `build` prompt: OpenCode, plugins, configuration
merging, permissions and actual child agents do not execute. The parent requests
delegation, while child results and viewer launches are deterministic simulations.
Successful child replies model a completed review followed by a Difit launch,
including when findings exist; their internal execution order is assumed, not
measured. The grader can reject a viewer-first parent trace but cannot verify a
real child's `difit-review` skill call or viewer launch.
It cannot prove a child used a newer model, assess code-review quality, or
establish that the real runtime enforces delegation. No grader model is used.

A real model baseline requires a running local server and an explicit
`REVIEW_DELEGATION_MODEL`. Offline calibration must not be presented as that
baseline. Add a sanitized original-session trace when available for exact replay.
