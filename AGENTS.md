# AGENTS.md

@RTK.md

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles with default label strings: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Working protocol

- **NEVER commit directly to the `main` or `master` branch. No exceptions.** Always create a feature branch, commit changes there, push, and open a pull request (PR) for review.
- **When starting work on a GitHub Issue, always add the `in-progress` label to the issue immediately so everyone knows it is actively being worked on.**
- This repository has an active `pre-commit` hook installed that programmatically blocks direct commits to `main` and `master`.
- Before editing, inspect the relevant code, tests, project instructions, and current `git status`/diff.
- Treat user requirements, repository documentation, tests, and existing behavior as the source of truth, in that order. Ask a concise question when they conflict or leave a material ambiguity.
- Make the smallest change that fully resolves the request. Do not refactor unrelated code or add compatibility paths without a concrete need.
- Preserve unrelated worktree changes. Never revert, reset, clean, or overwrite work you did not create.
- After editing, run the narrowest relevant formatter, lint, typecheck, and test commands. State explicitly if verification could not run or fails.
- For behavior changes, add or update a focused regression test when the repository has an appropriate test layer.
- Before committing, inspect `git status`, `git diff`, and recent commit messages. Commit only when explicitly requested.
- When a commit is explicitly requested, prefer small atomic commits. For behavior-changing work, commit after REFACTOR and final verification, not after GREEN. Keep each commit scoped to one verified behavior, slice, or other inseparable unit of work.

## Documentation

- Read repository-local `AGENTS.md`, `README`, and relevant docs before making decisions; nearer instructions override broader ones.
- Update documentation only when a user-visible workflow, configuration surface, or durable architectural decision changes.
- Use existing project terminology and conventions rather than introducing new names for established concepts.

## Configuration changes

- For changes to OpenCode configuration, agents, plugins, skills, or MCP setup, validate configuration shape first.
- OpenCode must be restarted after configuration-time files change.
