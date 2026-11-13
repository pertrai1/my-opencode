# Progress: wi-20261113T131757Z-make-modern-web-guidance-research-conditional-wh-e56a4c1c

Execution state: implemented and verified locally on branch
`improve/conditional-web-guidance`; committed with owner-approved `--no-verify`
and published as a draft PR. Exact-head CI is tracked in the PR. Second of three
PRs replacing PR #107.

## Acceptance criteria

- [x] A lookup is required before choosing an unfamiliar web API, a new UI
  pattern, a performance technique, browser-support or fallback behavior, a new
  component without a repository pattern, or when the user asks.
- [x] A mechanical edit that keeps an inspected pattern skips the lookup; an
  existing pattern is treated as local convention, not current best practice.
  Accessibility and browser-support rules still apply.
- [x] The skill description keeps upstream's trigger list and the
  training-data reason, within the 1024-character description limit.
- [x] `frontend-a11y` step 4 and `docs/required-skills.md` match; a test guards
  the contract.

## Verification

- Node 22.22.0 / npm 10.9.4.
- `node --test tests/install-required-skills.test.mjs`: 9 passed, 0 failed.
- Negative control: restoring the `origin/main` skill made the new test fail;
  the edited file was restored byte for byte.
- `npm run ubs` with `TMPDIR` set to a real path: toolchain, typecheck, ESLint,
  Markdown lint, and workflow pins passed; tests 548 passed, 2 failed. Both
  failures are the macOS-only `pr-agent-encoding` EILSEQ tests, which also fail
  on `origin/main` here and passed on Linux CI for PR #108.
- Review fix (CodeRabbit, PR #109): an explicit user request for current
  guidance now overrides the mechanical-edit skip, in both the description and
  the body. Description trimmed to 1,022 characters; body assertions now ignore
  line wrapping. Negative control: removing the body exception fails the test.
  `npm run ubs` again: 548 passed, the same 2 macOS-only failures.
- Not run: a live model check of when agents now trigger the lookup.

## Blockers

- None. The pre-commit hook (`npm run ubs`) cannot pass on this Mac because of
  the two EILSEQ tests; the owner approved committing with `--no-verify`, and
  Linux CI runs the full suite.

## Next action

Owner review once exact-head CI is green; do not merge automatically. Then
PR 3 (slimmer global AGENTS.md).
