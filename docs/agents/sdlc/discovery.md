# SDLC: Target discovery

Phase reference for `sdlc-orchestrator`. Read before entering the relevant phase;
this document does not grant permissions or lifecycle authority to delegated roles.

## Target discovery and confirmation

Discovery must happen before **any** target-facing delegation or verification.

1. **Select the target workspace in precedence order:**
   1. Use the user-specified workspace name/path when provided.
   2. Otherwise, use the active working repository from OpenSpec/agent context.
2. **Resolve target root and change context from OpenSpec outputs** (`openspec list`, `openspec inspect`, `openspec show`, `openspec status`) rather than deriving from harness-relative `openspec/...` paths.
3. **If multiple candidate target workspaces remain** (or context is not unambiguous), pause and ask the user to choose; never guess.
4. **Do not proceed** until a target workspace and root are explicitly selected.
5. **Record the selected target root and source-of-truth evidence** in `progress.md` and `intent.md` before delegating implementation work.

For each selected target:

- Capture the OpenSpec-resolved target planning root, change root, and current state as authoritative command inputs.
- Confirm target root in writing (`intent.md` and/or `progress.md`) before:
  - running target-facing verification commands, or
  - delegating implementation/test-authoring roles.

### Ordered evidence collection before command selection

Before selecting command routes, verification mode, package manager, or delegation order, inspect target workspace evidence in strict precedence order:

1. nearest/applicable `AGENTS.md`
2. `README*`
3. `CONTEXT.md` or `CONTEXT-MAP.md`
4. relevant ADRs
5. language/toolchain manifests and lockfiles (for example `pyproject.toml`, `go.mod`, `Cargo.toml`, or package-manager lockfiles)
6. declared project commands (`package.json` scripts, task runner configuration, or documented equivalents)
7. compiler/typechecker configs for the affected language and package
8. test/lint configuration and CI commands
9. existing tests
10. public exports / entry points

Rules:

- Later evidence must not override earlier applicable instructions. If later findings conflict with earlier evidence, pause and escalate immediately; do not override.
- Record the evidence list consulted and missing evidence in `progress.md` and/or `intent.md` before command selection/delegation.
- Record the selected toolchain (and package manager when applicable) and selected commands (including test/typecheck/lint command and whether typechecking is `no-contract`) before delegation.
- A target without `package.json` is valid. Select commands from its native
  project evidence. Record working directories and affected package/consumer
  scope; do not treat a single-package result as a monorepo-wide pass.

### Public API evidence for no-contract RED handoffs

For `no-contract` flows that require RED handoff:

- require named public API evidence (exports and entry points) before delegating RED.
- record the named public API source in `progress.md` or `intent.md` before delegation.
- do not delegate RED until that evidence is present and recorded.

### Package-manager-aware command selection

Select target-repository commands from its instructions, documented task runner,
manifests, tool configs and CI. The following package-manager rules apply only to
JavaScript/TypeScript packages; do not require a Node package manager for another
language. For example, use a Python project's documented test/typecheck commands
and environment, not the harness's npm scripts.

For JavaScript/TypeScript packages, select commands in this order:

1. Use project-declared scripts from target `package.json` when they satisfy the needed verifier or test action.
2. If no suitable script exists, infer the narrowest fallback command from target lockfile and toolchain evidence.
3. If multiple plausible commands remain, pause and ask the user instead of guessing.

Package manager selection is evidence-driven:

- `pnpm-lock.yaml` -> use `pnpm`
- `yarn.lock` -> use `yarn`
- `bun.lock` or `bun.lockb` -> use `bun`
- `package-lock.json` -> use `npm`
- if no authoritative lockfile exists, prefer the package manager named by earlier evidence; otherwise pause and escalate

When invoking target scripts, use the selected package manager's script form rather than hard-coding `npm`:

- `npm run <script>` / `npm test`
- `pnpm run <script>` / `pnpm test`
- `yarn <script>` / `yarn test`
- `bun run <script>` / `bun test`

Fallback commands must stay narrow and evidence-backed:

- prefer project-local verifier/test commands over broad build or workspace-wide commands;
- record why fallback was needed and what evidence supported it;
- do not invent package-manager commands that conflict with earlier instructions or target-repo conventions.

Before execution or delegation, check whether the role permits the selected
commands and contract/test paths. This does not expand any allowlist. If a check
or language-specific contract layout is unsupported, record it as blocked and
return the exact command/path gap to the authorized owning session or human.
Do not substitute npm, weaken permissions, or pretend an unexecuted check passed.

### Verifier-mode selection

Select verifier mode from target-repository evidence before delegating delivery:

1. **Type mode for TypeScript targets**
   - If the target has `tsconfig*` evidence or another authoritative TypeScript project signal, use `type` mode.
   - Prefer a project-declared typecheck script when present.
   - Otherwise use the narrow fallback `tsc --noEmit` in the selected target workspace.

2. **Type mode for JavaScript with `checkJs`**
   - If the target is JavaScript-first but has `jsconfig*`, `checkJs`, `@ts-check`, or equivalent evidence that TypeScript is being used for JS verification, use `type` mode.
   - Prefer a project-declared typecheck or verification script when present.
   - Otherwise use the narrow fallback `tsc --checkJs` against the selected target workspace.

3. **Type mode for other configured typecheckers**
   - Use the target's configured checker/compiler and command, such as Python
     `mypy`/`pyright`, rather than inferring absence from missing TypeScript files.
   - Confirm the existing worker permissions support the required contract/test
     layout and command. If not, return the gap as blocked; do not downgrade to
     no-contract solely to bypass a role's limitations.

4. **No-contract mode when the target has no viable type checker**
   - If the target has no viable configured compiler/typechecker (including no TypeScript or `checkJs` evidence), use `no-contract` mode. A role's inability to run a configured checker is a blocker, not absence of a checker.
   - Do not delegate RED until a trusted public API source-of-truth and exact test-facing signature are identified and recorded.

Mode selection rules:

- bind the chosen mode to concrete evidence from the ordered discovery pass;
- record the selected mode, command, and supporting evidence in `progress.md` or `intent.md` before delivery delegation;
- if evidence supports more than one mode or conflicts across modes, pause and escalate instead of choosing implicitly;
- do not downgrade a behavioral task to documentation-only work because type evidence is missing.

Pause and escalate when:

- No target workspace can be determined.
- The target is still ambiguous after user-visible options are exhausted.
- No-contract mode is required and the target lacks sufficient trusted public API source-of-truth evidence.

## Store selection

When a user names a store, or the work clearly lives in a registered standalone OpenSpec store, resolve the store before lifecycle movement:

1. Run `openspec store list --json`.
2. Identify the selected store id.
3. Keep `--store <id>` sticky on every OpenSpec command that accepts it for the rest of the workflow.

Use `--store <id>` on applicable commands such as `new change`, `status`, `instructions`, `list`, `show`, `validate`, `archive`, `doctor`, `context`, `schemas`, and `view`.

If store selection is ambiguous, pause and ask the user instead of guessing.
