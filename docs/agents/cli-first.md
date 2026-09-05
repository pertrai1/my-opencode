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
