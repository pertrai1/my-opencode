# Node.js skill evals

Run from the repository root after installing the supported Node/npm toolchain
and `npm ci`. These use the pinned repository Promptfoo dependency.

```sh
PROMPTFOO_DISABLE_TELEMETRY=1 PROMPTFOO_DISABLE_UPDATE=1 PROMPTFOO_CONFIG_DIR=.promptfoo \
  node --require ./evals/failure-reporting/offline.js ./node_modules/promptfoo/dist/src/entrypoint.js \
  eval -c evals/nodejs-skill/replay.mjs --no-cache --no-write --no-share --no-progress-bar
PROMPTFOO_DISABLE_TELEMETRY=1 PROMPTFOO_DISABLE_UPDATE=1 PROMPTFOO_CONFIG_DIR=.promptfoo \
  node --require ./evals/failure-reporting/offline.js ./node_modules/promptfoo/dist/src/entrypoint.js \
  eval -c evals/nodejs-skill/calibration.mjs --no-cache --no-write --no-share --no-progress-bar
node --test tests/nodejs-skill-eval.test.mjs
```

`replay.mjs` uses explicitly hand-authored synthetic plans, not recorded model
sessions. It checks Promptfoo/provider/grader wiring for API async errors, CLI
streams/output, library contracts, script injection, service shutdown, Node worker
selection, and three browser/Angular nonactivation cases. `calibration.mjs` checks
that known good/bad candidates receive the expected verdict; all calibration rows
should pass, including rows whose candidate must be rejected. Both run with a
network-blocking preload. Provider unit tests cover setup errors and prompt shape.
None of these results establishes model quality or actual automatic skill loading.

## Optional live model plan evaluation

Only after explicit authorization for paid model calls and separately approved
credential setup, run:

```sh
PROMPTFOO_DISABLE_TELEMETRY=1 PROMPTFOO_DISABLE_UPDATE=1 PROMPTFOO_CONFIG_DIR=.promptfoo \
  npx --no-install promptfoo eval -c evals/nodejs-skill/live.mjs \
  --no-cache --no-write --no-share --no-progress-bar
```

`live.mjs` uses `openai:gpt-6.1-sol` and the same scenarios/grader. It supplies the
current skill entrypoint and asks for structured activation/reference/action plans.
Expectations stay in the grader, outside the model prompt. The action vocabulary
is supplied so scoring does not depend on prose synonyms. Exact reference/action matching
is deliberately strict and may reject a defensible broader plan; inspect failures.

This is a constrained planning probe, not an OpenCode tool trace or code execution
test. It does not load topic reference contents, prove the agent read them, verify
code fixes, or establish automatic discovery in a real codebase. To make those
claims, separately run fresh OpenCode sessions in representative Node and browser
fixtures and inspect completed skill/reference reads plus resulting code/tests.
No live calls are part of repository tests or the offline commands above.
