## Context

See `proposal.md` for motivation and `specs/checks-runner/spec.md` for observable behavior. The existing reusable runners are Node scripts stored in this OpenCode configuration repository but invoked from a separate target worktree. `quality-verification.mjs` establishes the `.agents/reports/` JSON/Markdown artifact convention, while the verification prompts currently select and interpret basic project checks independently.

The design must preserve the repository-instruction precedence already enforced by `sdlc-orchestrator`: target `AGENTS.md`, README, lockfiles, and package scripts are inspected before target commands run. The new runner standardizes execution and evidence for supported conventional scripts; it does not replace the harness's responsibility to read target-repository instructions. `change-verifier` is intentionally unable to execute shell commands and must remain an evidence consumer rather than gain execution permissions.

The project supports Node 20 or newer and uses `node:test`. The implementation can therefore use built-in Node process, filesystem, crypto, and Git integration without adding a runtime dependency.

## Goals / Non-Goals

**Goals:**

- Give execution-capable OpenCode flows one target-root-aware entry point for conventional Node `typecheck`, `lint`, and `test` scripts.
- Produce compact, durable JSON and Markdown evidence that another agent or harness can understand without recovering terminal history.
- Keep check failure, absent configuration, process/setup failure, and report-persistence failure distinct.
- Prevent unbounded child output, accidental persistence of recognizable secrets, indefinite watch-mode execution, and report filename collisions.
- Preserve role separation: execution-capable commands/orchestrators create evidence; read-only verifiers consume it.

**Non-Goals:**

- Discover Python, Rust, Go, or other ecosystems in the initial implementation.
- Interpret prose in a target repository's `AGENTS.md` or README, invent fallback commands, or replace required project-specific checks such as build, docs, integration, or deployment validation.
- Add or modify scripts, dependencies, lockfiles, or `.gitignore` in a target repository.
- Cache a passing result as proof that a later workspace state still passes.
- Replace the existing quality-verification or Halstead runners.
- Add hooks or CI configuration to either this configuration repository or target repositories.

## Decisions

### 1. Keep the runner self-contained and target-root explicit

Implement `scripts/checks-runner.mjs` as an ES module with an async `main(argv)` export and a CLI entry point. The only initial options are:

- `--target <directory>`: resolve relative to the caller's current directory; default to `process.cwd()`.
- `--timeout <seconds>`: positive per-stage timeout with a documented default of 1,800 seconds.
- `--help`: print supported behavior without creating reports.

After target resolution, all manifest reads, child-process working directories, Git metadata, and report paths use the resolved target root. Invalid options and unresolved target paths return invocation exit code `2`; no target report can be promised before a valid target is known.

Alternative considered: expose an npm script from this configuration repository. Rejected because `npm run` would bind execution to the configuration repository instead of the arbitrary target worktree where OpenCode is operating.

### 2. Discover only explicit conventional package scripts

Read the target root's `package.json` and create three stage records in fixed order: `typecheck`, `lint`, and `test`. A stage is executable only when the same-named key exists in `scripts`; otherwise its status is `not-configured`. Do not infer `tsc`, ESLint, framework test commands, workspace recursion, or aliases such as `check`.

Select the package manager with this precedence:

1. A supported `packageManager` declaration (`npm`, `pnpm`, `yarn`, or `bun`).
2. Exactly one supported root lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, or `bun.lockb`).
3. Otherwise, return a setup error rather than guessing.

A valid explicit `packageManager` declaration wins over stale conflicting lockfiles, and the report records both the selection source and observed lockfiles. Invoke every script without a shell as `<manager> run <stage>`, separating executable and arguments internally. A missing package-manager executable is a setup/process error, not a failed project check.

Alternative considered: share or extract `quality-verification.mjs`'s package-manager helper. Rejected for this change because that helper defaults to npm when no lockfile exists, while the new runner's contract forbids an ambiguous guess. Coupling the runners would either change existing quality-runner behavior or weaken this runner's evidence semantics.

### 3. Run child processes asynchronously with bounded capture

Use `child_process.spawn` with `shell: false`, the target root as `cwd`, inherited environment, `CI=1` when the caller has not already set `CI`, and color disabled when the caller has not explicitly configured color. Print only stage headers, stage outcomes, bounded failure diagnostics, and final report paths to the terminal.

Capture stdout and stderr with a bounded head/tail accumulator rather than retaining complete process output. Retain at most 32 KiB per stream (8 KiB head and 24 KiB tail), track omitted byte counts, and mark truncation in both report formats. The limit is an implementation constant that tests can exercise without producing large fixtures.

Apply the per-stage timeout through an abort signal, record `timedOut` and any termination signal, and attempt to terminate the package-manager process. A timeout is a stage error and stops subsequent stages. This bounds accidental watch mode even when `CI=1` is ignored.

Alternative considered: `spawnSync` with a large `maxBuffer`. Rejected because it either retains arbitrarily large output or converts output-volume overflow into an opaque process error and makes timeout/stream handling less explicit.

### 4. Use stable stage and overall result models

Each stage has one of: `not-configured`, `not-run`, `passed`, `failed`, or `error`. Execution stops at the first `failed` or `error`; later configured stages become `not-run`.

The report's overall status has one of:

- `passed`: at least one stage was configured and every executed stage passed.
- `failed`: a configured project script exited non-zero.
- `blocked`: no supported stages were configured.
- `error`: manifest/package-manager discovery, process startup/timeout, or runner operation failed.

The CLI returns `0` for `passed`, `1` for `failed` or `blocked`, and `2` for invocation, setup, process, or report-persistence errors. The child exit code remains in its stage record rather than becoming the runner's public exit code.

Alternative considered: use one generic failing status and propagate the child exit code. Rejected because downstream agents could mistake unavailable tooling for a code defect and could not reliably interpret arbitrary script exit codes.

### 5. Treat report pairs as durable history with explicit applicability metadata

Generate one collision-resistant run ID from a UTC millisecond timestamp plus a short random suffix. Use it in both `checks-<RUN_ID>.json` and `checks-<RUN_ID>.md`; create `.agents/reports/` recursively. Write both files to temporary sibling paths before renaming them, and clean up partial files best-effort if persistence fails.

JSON schema version 1 contains:

- run ID, invocation, start/completion timestamps, and configured timeout;
- target root and detected Node/package-manager evidence;
- Git metadata captured before and after checks when available: Git root, HEAD commit, branch, dirty state, and staged/unstaged/untracked path summaries, excluding `.agents/reports/`;
- all three stage records, including display command, argument array, cwd, timing, status, exit code/signal, timeout state, and condensed stdout/stderr with truncation metadata;
- overall status/category and paths to the paired reports.

The Markdown report renders the same decisive metadata, a stage table, failure/error diagnostics, missing/not-run stages, repository-state warning, and disposition. A non-Git directory records Git metadata as unavailable.

Repository metadata makes historical reports understandable, not cacheable proof. A prior report is safe evidence of a past run. A later verifier can treat it as current only when it can establish that the relevant workspace state still matches; otherwise it reruns the runner. If checks change tracked or untracked target files, the differing before/after metadata is called out rather than hidden.

Alternative considered: persist only JSON or only terminal output. Rejected because JSON is the stable harness interface, while Markdown supports human review and compact agent context; terminal output alone is vulnerable to truncation and session loss.

### 6. Redact before persistence

Pass every retained stdout/stderr fragment through a local redaction helper before constructing either report. Initially cover the same recognizable classes used by the safety plugin: Authorization bearer/basic values, common key/secret/token/password assignments, private-key bodies, and OpenAI-style `sk-` values. Reports state that redaction is best-effort and do not include the child environment.

Keep the helper local to the script or under `scripts/lib/`; do not import the TypeScript safety plugin into the standalone Node runner. Tests cover every supported pattern and verify that redaction happens before Markdown and JSON serialization.

Alternative considered: rely on the OpenCode safety plugin to redact shell output. Rejected because report files are written directly by the child script and therefore bypass tool-output retention hooks.

### 7. Preserve execution/verification role boundaries

Add `commands/checks.md` using the existing `quality.md` command pattern. It instructs the command agent to inspect applicable target instructions, invoke `node ~/.config/opencode/scripts/checks-runner.mjs` from the selected target root, read the exact generated JSON and Markdown paths printed by the process, and summarize status, missing stages, failures/errors, and repository-state applicability.

Update integration prompts as follows:

- `commands/verify.md`: use the runner for the supported baseline Node stages and cite its current-run report; still execute additional checks required by the target repository or source of truth.
- `agents/sdlc-orchestrator.md`: add narrowly scoped bash permission for the runner and invoke it only after the existing ordered evidence and package-manager discovery pass. Include the resulting report path in evidence handed to the verifier.
- `agents/change-verifier.md`: accept and cite the checks report supplied by the orchestrator, inspect stale/missing-stage indicators, and remain shell-denied. Do not grant it runner execution permission.

This deliberately refines the proposal's broad wording that each verification-oriented agent should "run" the script: the orchestrator or command that owns target execution runs it, while the independent verifier consumes the persisted evidence. This preserves the repository's existing independent-validation boundary.

Alternative considered: grant `change-verifier` bash access so it can rerun checks. Rejected because that agent's current contract is evidence-only and expanding its permissions would weaken role separation.

### 8. Test through temporary target repositories

Add `tests/checks-runner.test.js` using `node:test`. Unit-test argument parsing, package-manager selection, command construction, output condensation, redaction, result classification, and Markdown rendering. Integration fixtures use temporary directories, generated `package.json` files, fake package-manager executables on `PATH`, and optional temporary Git repositories to verify:

- default and explicit target isolation;
- complete and partial discovery;
- ambiguous/no package manager and no supported checks;
- deterministic ordering, fail-fast behavior, timeout handling, and `not-run` stages;
- reports for pass, failure, blocked, setup error, and non-Git targets;
- unique report pairs and persistence-error fallback;
- before/after repository metadata and printed artifact paths.

Add narrow prompt-contract tests or text assertions for the new command, orchestrator allowlist, and read-only verifier integration. Keep existing quality-verification tests green to prove the new runner did not alter that runner's behavior.

## Risks / Trade-offs

- **[Conventional script names do not cover every repository]** → Record absent stages explicitly, retain project-instruction discovery in the harness, and require supplemental project-specific checks rather than inventing commands.
- **[Reports intentionally mutate the target worktree]** → Write only beneath `.agents/reports/`, never edit `.gitignore`, exclude the runner's own report directory from repository-state metadata, and document that target repositories may choose to ignore this established artifact path.
- **[Persisted output can contain an unrecognized secret]** → Bound output, omit environment data, redact known patterns before both serializations, and label redaction as best-effort.
- **[Fail-fast execution omits later diagnostic information]** → Record configured later stages as `not-run`; optimize for fast feedback and rerun after the first failure is fixed.
- **[A package script may mutate files]** → Capture Git state before and after execution and surface the mismatch so another agent does not mistake the report for proof of an unchanged workspace.
- **[A prior report may be mistaken for current proof]** → Store applicability metadata and update verifier prompts to label mismatched or unverifiable prior reports as historical and rerun before a current verification claim.
- **[Default timeout may be too short for unusually large suites]** → Provide the explicit positive `--timeout` override and record the effective value in reports.
- **[JSON schema consumers may depend on fields]** → Include `schemaVersion: 1`, test required fields, and require a future schema-version change for breaking report-shape changes.

## Migration Plan

1. Add the runner and focused tests without changing existing verification prompts.
2. Add `/checks` and document its target-worktree invocation and report artifacts in README.
3. Wire execution-capable verification flows to the runner and update `change-verifier` to consume its evidence without expanding permissions.
4. Run typecheck, lint, the full test suite, and a manual smoke against a temporary external target repository.

Rollback removes the new runner/command and restores the affected prompt text and allowlist entries. Existing quality reports, CI, git hooks, and target repositories remain otherwise unchanged; historical `checks-*` reports can remain as inert evidence or be deleted by their repository owners.
