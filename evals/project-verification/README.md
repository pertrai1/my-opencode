# Project verification checks

Run from the configuration repository with its supported Node.js toolchain:

```sh
node --test tests/project-verification.test.mjs
```

## What runs offline

- Configuration assertions check that the protocol is globally loaded from
  `~/.config/opencode/docs/agents/verification-evidence.md` and referenced by its
  SDLC, TDD, verifier, reviewer, and `/verify` consumers. These are distribution
  checks, not proof that OpenCode loaded the files or that a model follows them.
- Permission assertions retain shell denial for the change verifier and test
  reviewer. They inspect configuration, not runtime sandbox enforcement.
- Executed Node and Python fixtures exercise the same shipping-cost acceptance
  claim in independent temporary target directories. Each checks ordinary,
  zero-shipping, and invalid-negative inputs. Their manifests deliberately differ:
  `package.json` versus `pyproject.toml`; the Python target has no `package.json`.
- Each fixture initially omits shipping from the total. The runner records an
  actual failing process, repairs only that temporary source, then records an
  actual successful rerun. Each run prints its target working directory, checked
  against the subprocess cwd. TAP diagnostics retain exact argument arrays,
  outputs, exit codes, source scope, and the explicit unversioned fixture status.
- Files use `.fixture` suffixes so repository-wide test discovery cannot execute
  intentionally failing examples. Copies in temporary directories use native
  filenames and are removed after each test. No installs or provider calls occur.

Python uses its standard-library `unittest` runner. If `python3` is missing, the
Python scenario is visibly skipped rather than counted as passing evidence.
Neither fixture verifies an arbitrary real project's discovery, dependencies,
revision tracking, deployment, or user-visible acceptance.

## Human interpretation of the evidence

Before the repair, shipping inclusion is **failed**, even though zero shipping
and invalid-input rejection pass. The change is not ready. After the recorded
rerun it is **passed** for these bounded fixture claims only. No unreplayed
command, environment, integration, or broader acceptance claim becomes passed.

A shell-restricted reviewer must report a required direct run as **blocked** and
ask an authorized executor for evidence, without weakening permissions. A check
that was never attempted is **not run**. These two disposition examples are
review guidance, not simulated permission failures or automated model judgments.

For a real target, additionally identify revision and changed scope, explain any
requirement, assumption, or default change, retain a disconfirming scenario, and
surface material residual risks for human decisions. A small configuration-only
change should use focused configuration checks; this harness does not establish
that model routing preserves that proportionality.

## Honest-reporting calibration and remaining validation

Reuse the existing [failure-reporting rubric](../failure-reporting/rubric.txt),
[failure fixture](../failure-reporting/evidence.txt), and
[interrupted-run fixture](../failure-reporting/interrupted-evidence.txt).
Their existing wiring and calibration checks can be run separately:

```sh
node --test tests/failure-reporting-eval.test.mjs tests/failure-reporting-wiring.test.mjs
```

Those checks use hand-authored candidates and offline providers. They test prompt
wiring and calibration, not an agent's honest behavior on a new project. The
rubric is specific to its supplied traces; it is not reused as a generic judge
of these shipping fixtures.

No live model, OpenCode session, semantic judge, or runtime adherence evaluation
is performed here. Actual SDLC validation remains a separate observed run against
a target project, retaining command evidence and a reviewed report. A useful
runtime run should include the failed claim, a non-Node target, a blocked check,
and a changed assumption or default requiring a human decision. Do not infer
those outcomes from passing static assertions or deterministic fixture tests.
