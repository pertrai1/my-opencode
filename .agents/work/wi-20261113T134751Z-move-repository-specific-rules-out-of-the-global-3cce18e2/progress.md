# Progress: wi-20261113T134751Z-move-repository-specific-rules-out-of-the-global-3cce18e2

Execution state: implemented and verified locally on branch
`improve/slim-global-agents`; committed with owner-approved `--no-verify` and
published as a draft PR. Exact-head CI is tracked in the PR. Third of three PRs
replacing PR #107.

## Acceptance criteria

- [x] Policy ownership, plugin and shared runtime changes, generated and
  vendored content, and configuration changes moved verbatim (bullet text
  unchanged) from `AGENTS.md` into `skills/harness-maintenance/SKILL.md`.
- [x] `AGENTS.md` points to the skill by name and path, so harnesses without
  skill discovery can still read it.
- [x] Verification evidence rules have one source: the two duplicated
  `AGENTS.md` bullets are replaced by a pointer, and their unique details
  (environment restriction vs application failure; no "fully passing" with a
  failed, skipped, or blocked check) moved into the globally loaded protocol.
- [x] `tests/agents-context.test.mjs` guards ownership, the pointer, the kept
  sections, and the single evidence source.

## Decisions

- Kept Issue tracker, Triage labels, and Domain docs in `AGENTS.md`. Their docs
  describe "this repo", but whether the owner wants them in every project is
  unconfirmed and they are small. Raised as a question in the PR.
- `AGENTS.md`: 9,451 to 7,350 bytes, loaded in every project.

## Verification

- Node 22.22.0 / npm 10.9.4.
- Focused: agents-context, project-verification, review-delegation,
  install-required-skills: 38 passed, 0 failed.
- Negative control: restoring `origin/main`'s `AGENTS.md` fails 2 of 3 new
  tests; file restored byte for byte.
- `npm run ubs` with `TMPDIR` set to a real path: toolchain, typecheck, ESLint,
  Markdown lint, workflow pins passed; tests 551 passed, 2 failed (the known
  macOS-only `pr-agent-encoding` EILSEQ tests).
- Not run: a live model check that agents load the skill when changing this
  repository.

## Blockers

- None. The pre-commit hook (`npm run ubs`) cannot pass on this Mac because of
  the two EILSEQ tests; the owner approved committing with `--no-verify`, and
  Linux CI runs the full suite.

## Next action

Owner review once exact-head CI is green, including whether Issue tracker,
Triage labels, and Domain docs should also move; do not merge automatically.
