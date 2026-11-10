# Progress: live fixture location

Updated: 2026-11-10
Execution state: in progress

## Acceptance criteria

- [x] Selected Angular, plain JavaScript, Node, and browser fixture directories survive the actual v2 session-create decoder.
- [x] Existing setup/cancellation behavior and permission gates remain unchanged.

## Steps

- [x] Inspected open PRs (none), recent #101 feedback, main source and instructions.
- [x] Reproduce contract failure, fix request, run focused and aggregate verification. Aggregate has the environment failures documented below.
- [ ] Review final diff, open draft PR, and verify exact-head CI.

## Verification

- Main 86ae0f2 still sends unsupported top-level root; protocol 2.0.12 accepts location.
- Installed dependencies copied from existing workspace with identical package-lock.

## Blockers

- Graph, Context7, and CodeScene tools unavailable. Use source inspection; do not claim those checks passed.

## Next action

Commit the reviewed fix, open a draft PR, and check exact-head CI.

## Verification update

- Five fixture assertions failed before the fix; 37 provider tests pass after.
- Updated both dependent Node mock CLIs; all 43 provider/Node/Promptfoo tests pass on Node 22.23.3/npm 10.9.9.
- Full UBS: 538 tests, 527 pass, 11 fail in unchanged PR-Agent tests because sandbox exposes read-only `/tmp/.git`. Their guard correctly refuses temporary storage inside a Git checkout. No guard bypassed or changed.
- Toolchain, typecheck, ESLint, Markdown lint, workflow-action verification, and diff checks pass. Typecheck excludes eval JavaScript.
- Only the executor-injected UNDICI-EHPA warning was suppressed during aggregate checks.
- Independent source review found no defects, including the dependent mock updates.
- No live server/model run; installed protocol 2.0.12 decoding is verified, server behavior end to end is not.
