# CLI-first workflow

Use the smallest existing local tool that can complete the task. Prefer a
repository script or a supported CLI over an MCP tool when both provide the
needed operation. Use direct REST only when the existing CLI lacks the needed
operation or direct HTTP produces a concrete benefit.

Use `rtk` for shell commands when it supports the command. Use `rg` and Git for
repository inspection, `gh` for GitHub operations, and the checks and quality
runners for their documented verification scopes. Follow agent-specific shell,
file, and user-authorization permissions; the presence of an executable on the
host does not grant permission to run it.

MCP remains appropriate when it provides a capability not supplied by an
existing CLI or script. MDN documentation, persistent memory, and remote
SonarQube findings have no assumed local replacement. Do not substitute local
linting for remote SonarQube analysis or quality gates.

The global configuration hides `mdn_*`, `llm-core_*`, `sonarqube_*`, and
`agentmemory_*` tools by default. Use or route work to `build` or `plan` when a
task needs one of those namespaces. Do not bypass an agent's denied MCP tool by
starting an equivalent MCP client through the shell.

Restart OpenCode after changing configuration-time files. When adding an MCP
server, add its tool prefix to the capability matrix and review which agents
need it before exposing it. Use [CLI tools](cli-tools.md) for the detailed
catalog and installation status; it is reference material, not an always-loaded
instruction.

## Target and evidence

Use the user's explicit target directory, otherwise the session's current working
directory. Resolve it to an absolute command directory; separately identify the
Git root when available. A nested package stays the command directory, not the
Git root. The global harness directory supplies tools and guidance, not an
implicit implementation target. Ask only when target or command selection is
materially ambiguous, not to reconfirm an unambiguous cwd.

User requirements and applicable target instructions take precedence over global
harness metrics. Additional global quality checks are advisory unless the user
or target explicitly adopts them as gates. Do not block delivery or refactor
unrelated code to satisfy unadopted metrics.

Run target-authorized commands with the existing checks runner, using repeatable
`--command '["executable","arg"]'` options for non-Node or custom checks. This
replaces Node defaults and executes argv without an implicit shell; use a shell
explicitly only when the target requires it. Runner permission is not permission
to bypass a denied operation through `--command`.

Restricted TDD/SDLC orchestrators allow only the exact no-argument runner command,
with target selection through the shell tool's working directory. Runner options
and custom commands require an authorized `build` session or a user decision;
do not bypass this restriction through wrappers or delegation.

Checks reports live in the command directory's `.agents/reports/`. Content
fingerprints combine canonical `git ls-files --stage -z` index bytes with all
Git-root tracked and nonignored untracked filesystem contents, excluding
`.agents/reports/` directories from both inputs. Dirty-to-dirty edits and index-only
staging invalidate evidence even when Git status paths stay identical.
Before/after mismatch, absent fingerprints, changed fingerprint algorithms,
later edits, changed commands, toolchains, dependencies, or relevant environment
invalidate reuse: rerun before claiming current verification. Equal fingerprints
are necessary but not sufficient; ignored inputs, non-Git targets, submodule
contents, and concurrent edits need separate evidence. Do not treat a passed
command as proof of an unchanged workspace or of unexecuted checks.

Timeout cleanup covers only the original POSIX process group (the immediate
child on Windows). Escaped sessions require external supervision; a timeout
cannot prove that all descendants were cleaned up.

No baseline worktree creation, reset, stash, or integration lifecycle is implied.
Record the starting dirty state and existing failures; identify unavailable
baseline proof explicitly rather than manufacturing a clean workspace.

`lean` cannot delegate tasks or use the question tool. Ask ordinary clarification
questions in chat. If work needs a denied tool, orchestration, or a deeper agent
handoff, ask the user to switch to `build` (or `plan` for read-only planning).
Do not promise an automatic switch or bypass permissions with a shell client.
