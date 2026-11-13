# Progress: wi-20261113T125805Z-load-sdlc-orchestrator-phase-contracts-as-skills-75595e91

Execution state: implemented and verified locally on branch
`improve/sdlc-phase-skills`; committed with owner-approved `--no-verify` and
published as a draft PR. Exact-head CI is tracked in the PR. First of three PRs
replacing PR #107.

## Acceptance criteria

- [x] Phase contracts load as orchestrator skills (`sdlc-discovery`,
  `sdlc-delivery`, `sdlc-closure`) through the existing global `skill` allow,
  so no `external_directory` prompt is needed. Orchestrator frontmatter unchanged.
- [x] Store selection and task completion authority stay in the always-loaded
  core; "as defined below" again points at a section below it.
- [x] Every-phase rules in the core are verbatim copies of skill sentences;
  `tests/sdlc-context.test.mjs` fails when a copy drifts.
- [x] Example-handoff guidance limits `tdd-orchestrator` handoffs to spec
  scenarios, existing tests, and public API examples inside the delivery contract.
- [x] OODA phase scenarios no longer tell the model to load the contract.

## Steps

- [x] Phase sections moved mechanically from `origin/main` (a351f17); each skill
  body matches the original text exactly.
- [x] Core rewritten: phase table, resume and missing-skill rules, every-phase
  rules, reconciled example-handoff bullet.
- [x] OODA harness: `load_skill` tool, two phase scenarios, provenance hashes for
  the skills, calibration traces, README.
- [x] Shared `tests/helpers/permission-rules.mjs` replaces the local copy in
  `tests/external-directory-permissions.test.mjs`.

## Verification

- Node 22.22.0 / npm 10.9.4 (default Node 26 fails the toolchain check).
- Focused: `node --require ./evals/failure-reporting/offline.js --test` on
  sdlc-context, ooda-eval, external-directory-permissions,
  orchestration-config, project-verification: 35 passed, 0 failed.
- Negative control: shortening one closure sentence made the verbatim-rule
  test fail; file restored byte-for-byte.
- `npm run ubs`: toolchain, typecheck, ESLint, Markdown lint, and workflow pins
  passed; tests 546 passed, 3 failed. The 3 failures
  (`git-test-isolation` /var vs /private/var, two `pr-agent-encoding` EILSEQ
  invalid-UTF-8 filenames) fail identically on a clean `origin/main` worktree
  on this Mac, so they are environmental, not caused by this change. With
  `TMPDIR` set to a real path, `git-test-isolation` passes; the two EILSEQ tests
  still fail because APFS rejects invalid UTF-8 filenames.
- Not run: live model eval (no model run approved), CodeScene and
  code-review-graph (not available in this session).

## Blockers

- None. The pre-commit hook (`npm run ubs`) cannot pass on this Mac because of
  the two EILSEQ tests; the owner approved committing with `--no-verify`, and
  Linux CI runs the full suite.

## Next action

Owner review once exact-head CI is green; do not merge automatically. Then
PR 2 (conditional web guidance) and PR 3 (slimmer global AGENTS.md).
