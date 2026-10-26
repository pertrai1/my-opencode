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
