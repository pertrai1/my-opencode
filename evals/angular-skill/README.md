# Angular skill eval

`live.yaml` starts a fresh OpenCode session and checks whether the agent loads the
Angular skill while explaining the application's root component. Configure fixture
directories on the machine running the eval:

| `vars.fixture` | Environment variable |
| --- | --- |
| `angular` | `ANGULAR_SKILL_ANGULAR_ROOT` |
| `plainJs` | `ANGULAR_SKILL_PLAIN_JS_ROOT` |

Only the selected fixture's variable is required. Use an Angular application for
`angular` and a plain JavaScript project for `plainJs`; the current `live.yaml`
selects `angular`. The provider checks that the selected root is an existing
directory before calling OpenCode. Relative paths resolve from the eval process's
working directory. Quote paths containing spaces; `~` in a quoted value is not
expanded by the provider.

With dependencies installed and `opencode` available on `PATH`, run from the
repository root:

```sh
ANGULAR_SKILL_ANGULAR_ROOT="/absolute/path/to/angular-app" \
  PROMPTFOO_DISABLE_TELEMETRY=1 PROMPTFOO_DISABLE_UPDATE=1 \
  PROMPTFOO_CONFIG_DIR=.promptfoo \
  npx --no-install promptfoo eval -c evals/angular-skill/live.yaml \
  --no-cache --no-share --no-progress-bar
```

The live eval uses the existing `lean` agent and `openai/gpt-6-astra` model with
`high` reasoning. It makes paid model calls. Missing, blank, nonexistent, and
non-directory roots return provider setup errors with no OpenCode calls.

For offline provider regression tests, run:

```sh
node --test tests/angular-skill-live-provider.test.mjs
```

These tests use temporary fixture directories and a fake `opencode` executable.
They verify root selection, setup errors, and session/trace handling without a
running OpenCode server or model calls. `replay.yaml` grades a recorded turn;
`calibration.yaml` includes one passing and two deliberately failing traces.
Neither demonstrates current live agent behavior.

The provider uses Promptfoo's documented
[`context.vars` and provider error interface](https://www.promptfoo.dev/docs/providers/custom-api/).

## Cancellation and cleanup limits

The shared live provider (also used by the Node.js trace eval) honors Promptfoo's
request `abortSignal`. Each CLI call has a four-minute timeout. After any failure
with a known session ID, it attempts one session-specific interrupt with a separate
five-second timeout. The original error and session ID remain in the result;
`metadata.cleanup.status` reports `interrupted`, `idle` (the server reported no
active execution), `unconfirmed` (interrupt failed or returned an invalid response),
or `not-attempted` (no session ID was received). Successful runs do not interrupt.
Sessions remain available for diagnosis; the shared server is never stopped.

These are per-call limits, not a total eval deadline. CLI termination alone does
not stop server work. Interrupt is best effort: a lost session-creation response,
a late prompt arriving after interrupt, an unreachable server, or abrupt process
termination can leave work running. An interrupt response describes execution
owned by the responding OpenCode process; it is not proof that all external work
or billing has stopped. When cleanup is unconfirmed, inspect the retained session
before rerunning. No process-wide signal handlers or automatic retries are added.

## Guidance scenarios (optional paid eval)

`guidance.mjs` evaluates minimal recommendations for 11 version, testing,
resource, SSR, component, and migration-boundary scenarios. It injects the actual
current skill and references and uses independent case rubrics to judge responses.
It does not test skill discovery, tool use, or a running Angular application.

With model credentials and dependencies already configured, explicitly opt in to
paid answer-model and judge calls with:

```sh
PROMPTFOO_DISABLE_TELEMETRY=1 PROMPTFOO_DISABLE_UPDATE=1 \
  PROMPTFOO_CONFIG_DIR=.promptfoo \
  npx --no-install promptfoo eval -c evals/angular-skill/guidance.mjs \
  --no-cache --no-share --no-progress-bar
```

The config uses `openai:gpt-6.1-sol` for both answers and grading, with concurrency
limited to one. Review qualitative failures rather than treating the model judge
as deterministic proof. The rubrics are withheld from the answer prompt.

Offline checks require no credentials or model calls:

```sh
node --test tests/angular-skill-guidance.test.mjs
```

Those checks verify scenario/config wiring and loading of current reference text.
They do not establish answer quality or demonstrate current live agent behavior.
