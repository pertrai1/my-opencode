## 1. CLI And Target Discovery

- [x] 1.1 Add `scripts/checks-runner.mjs` with `--target`, `--timeout`, and `--help` parsing plus stable public exit-code handling; verify focused tests cover defaults, relative and absolute targets, missing option values, invalid directories, invalid timeouts, and unknown options.
- [x] 1.2 Implement target `package.json` parsing and fixed `typecheck`/`lint`/`test` stage discovery without creating scripts or installing dependencies; verify fixtures cover complete, partial, missing, and malformed manifests and record absent stages as `not-configured`.
- [x] 1.3 Implement strict npm/pnpm/yarn/bun selection from `packageManager` or one root lockfile and shell-free `<manager> run <stage>` command construction; verify declaration precedence, every supported lockfile, zero/multiple-lockfile setup errors, and executable/argument separation.

## 2. Safe Fail-Fast Execution

- [x] 2.1 Implement bounded stdout/stderr head-tail capture and pre-persistence redaction for authorization values, common secret assignments, private-key bodies, and `sk-` values; verify retained byte bounds, omitted-byte metadata, truncation markers, and JSON/Markdown output contain no fixture secret values.
- [x] 2.2 Implement asynchronous noninteractive stage execution in the target root with inherited environment, default `CI=1`, color suppression, and the configurable per-stage timeout; verify fake package-manager fixtures receive the expected cwd/arguments/environment and a hanging stage terminates as an error.
- [x] 2.3 Implement deterministic `typecheck` → `lint` → `test` fail-fast orchestration and normalized stage/overall outcomes; verify passing and partial configurations return success, a failing stage returns failure with later configured stages `not-run`, no configured checks returns `blocked`, and process/setup errors remain distinct from code-check failures.

## 3. Durable Evidence Reports

- [x] 3.1 Capture pre-run and post-run Git metadata (root, HEAD, branch, dirty state, and staged/unstaged/untracked paths) while excluding `.agents/reports/`, with a non-Git fallback; verify clean, dirty, check-mutated, and non-Git fixtures produce the expected applicability metadata.
- [x] 3.2 Define JSON schema version 1 and its Markdown rendering with run identity, invocation, timing, target/toolchain evidence, all stage records, bounded diagnostics, report paths, and overall disposition; verify another test consumer can determine commands, missing stages, failures/errors, and workspace applicability from JSON without parsing terminal output.
- [x] 3.3 Persist collision-resistant paired `.agents/reports/checks-<RUN_ID>.{json,md}` artifacts for passed, failed, blocked, and setup-error runs using temporary files and best-effort cleanup; verify same-second runs do not overwrite each other, paths are printed, and an unwritable/conflicting report directory yields terminal fallback plus exit code `2`.
- [x] 3.4 Add end-to-end CLI fixtures for default and explicit external target directories; verify checks and reports are resolved only against the target, a failed report exists before process exit, and this OpenCode configuration repository's package scripts are not used accidentally.

## 4. OpenCode Harness Integration

- [x] 4.1 Add `commands/checks.md` to inspect applicable target instructions, invoke the runner from the active target worktree, read the exact generated report pair, and summarize status, gaps, diagnostics, and applicability; verify a prompt-contract test checks the invocation and evidence requirements.
- [x] 4.2 Update `commands/verify.md` and `agents/sdlc-orchestrator.md` to use current-run checks reports for supported baseline Node stages after repository evidence discovery, retain supplemental target-specific checks, and add only the runner's narrow orchestrator bash allowlist; verify text/permission tests cover command ordering, report handoff, and no broad shell permission expansion.
- [x] 4.3 Update `agents/change-verifier.md` to consume supplied checks reports, expose missing/stale evidence, and never treat historical results as current proof; verify its bash permissions remain fully denied and prompt tests require stale reports to trigger an unverified/follow-up result.
- [x] 4.4 Document `/checks`, direct target-worktree invocation, supported scripts/package managers, exit/result semantics, timeout behavior, paired report memory, stale-report limits, redaction limits, and optional `.agents/reports/` ignore policy in `README.md`; verify documented examples match CLI help and implemented behavior.

## 5. Verification

- [x] 5.1 Run the focused checks-runner and prompt-contract tests, then `npm run typecheck`, `npm run lint`, and `npm test`; verify all commands pass and no existing quality-verification behavior regresses.
- [x] 5.2 Run `node ~/.config/opencode/scripts/checks-runner.mjs` against a temporary external Node target for passing, failing, and stale-workspace cases; verify JSON and Markdown remain usable by a later session and record the exact report paths and outcomes.
- [x] 5.3 Run `node ~/.config/opencode/scripts/quality-verification.mjs --changed` and `openspec validate --changes add-checks-runner-script`; verify the change passes applicable quality checks and OpenSpec validation, or record any environment-dependent blocker with its exact command and evidence.
  - Approved waiver: the user explicitly waived the 100% coverage/CRAP requirement for this change, to be addressed separately. Test-file applicability, declared CLI entrypoint dead-code handling, and unsupported ESM Halstead handling were corrected; `node scripts/quality-verification.mjs --changed --check cognitive` passed after refactoring (`.agents/reports/quality-report-2026-09-04T18-14-19-876Z.json`). `openspec validate --changes add-checks-runner-script --json` passed.
