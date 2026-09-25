# Adaptive SDLC factory for LLM engineering

## Design goal

Use GPT-6 capabilities for judgment and adaptation while keeping deterministic controls where they matter: role-specific write boundaries, focused tests, auditable artifacts for consequential changes, and human control of product decisions and archival actions.

This configuration is designed around three common entry points:

- OpenSpec feature work
- Reproduce-first defect handling
- Brainstorming that becomes a durable handoff only after the idea is clear and useful progress has been made

## Workflow choices

| Route | Use when | Artifacts | Delivery |
| --- | --- | --- | --- |
| Brainstorm | Problem or solution is still forming | Conversation first; then a durable intent/idea note | Follow-up session, issue, or OpenSpec |
| Light feature | Small, clear, localized behavior with low integration risk | Short task list; no formal spec or types unless needed | Implement and focused verification |
| Full feature | Multiple systems, unclear choices, public/data/security contract, or high delivery risk | OpenSpec proposal/spec/design/tasks as useful; interfaces when they constrain real boundaries | Verifiable slices; independent checks at consequential gates |
| Defect | Reported incorrect behavior | Reproduction evidence; regression test when warranted | Minimal fix and rerun reproduction/checks |

An omitted artifact is a conscious routing choice, not missing work. Record the reason when the decision could affect correctness or later maintenance.

## OpenChamber operating model

OpenChamber is the work control surface around OpenCode. Use its worktree sessions to isolate parallel changes, session goals to keep an agent focused on acceptance criteria, built-in issue/PR and Git views to inspect work, and project actions for repeatable repository-specific checks. Keep workflow state in OpenSpec/Git artifacts where it needs to survive sessions.

OpenChamber extensions are separate sandboxed panels with explicit capabilities. Add one only when a durable SDLC dashboard, task board, or custom interaction is useful; do not build an extension to reproduce OpenCode agents, skills, or commands. Extensions can attach tasks, start sessions, send prompts, access project files, or call the Small Model only when their declared capabilities are approved. A local extension service runs with the user's full access and should be avoided unless the panel cannot do the job.

The existing TypeSafe reviewer router remains the change-aware selection mechanism for `/code-review`. It selects specialist review agents from change metadata, falls back to manual rules, and intentionally sends metadata rather than raw diff content. Avoid a second router in this SDLC orchestrator.

## Control placement

- **Model:** classify requests, choose depth, identify ambiguity, and adapt within declared policies.
- **Skill:** reusable procedure and criteria loaded when the request matches.
- **Agent:** distinct permissions, model assignment, context isolation, or durable role responsibility.
- **Command:** explicit, repeatable entry point such as `/work`, `/apply`, or `/opsx-new`.
- **OpenSpec:** accepted scope and lifecycle record for substantial changes.
- **MCP:** external or local capability that cannot be replaced by repository context or built-in tools.
- **Plugin:** deterministic hooks, safety controls, or runtime integration.
- **OpenChamber:** visual oversight, worktree/session organization, and optional UI extensions.

## Agent use

Keep the existing artifact authors and TDD roles available. The orchestrator selects them only when needed. Reviewer selection remains change-aware through TypeSafe; independent `change-verifier` review is reserved for full/consequential changes. Do not fan out every task to every reviewer.

The default `build` model is GPT-6 Sol for routine implementation. `plan` and `sdlc-orchestrator` use GPT-6 Astra for complex planning and routing; role subagents retain their specific model and permission assignments. The session's selected model remains an OpenCode session choice.

## Permission design

Use V2 ordered `permissions` rules. Keep global rules short and limited to high-impact protections; rely on each role's narrow edit/subagent/shell policy for workflow boundaries. V2 custom agents use their own permissions, so parent restrictions are not inherited by child subagents. Permission rules append, and the last matching rule wins. When access fails, inspect the effective rule order and target path/command before adding a broad exception.

## Validation and operating checks

After changing config-time files, restart OpenCode. Confirm in the actual runtime:

1. `/work` selects the adaptive orchestrator.
2. `/opsx-new` and `/opsx-apply` preserve OpenSpec command behavior.
3. The lightweight route can edit application code, run the repository's actual package-manager test, and report evidence.
4. TDD roles retain contract/test/implementation edit separation when that route is selected.
5. `/code-review` invokes TypeSafe and launches selected read-only reviewers, or uses documented fallback behavior.
6. MCP servers connect under the V2 `mcp.servers` configuration and unavailable project-specific Sonar settings disable Sonar safely.
7. OpenChamber can operate sessions/worktrees and issue/PR review without a custom extension.

Source notes: OpenCode V2 configuration, agent, permission, skill, and MCP documentation; OpenChamber Extensions, Host API, Worktree Sessions, Session Goals, Project Actions, and GitHub workflow documentation. See the PR description for links.
