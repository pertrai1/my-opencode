---
name: harness-maintenance
description: Rules for changing this OpenCode configuration repository (~/.config/opencode). Covers policy ownership for models, routing, permissions, and workflow gates; plugin and shared runtime changes; generated and vendored skills; and configuration validation and restarts. Load it before editing or reviewing the repository's agents, commands, plugins, skills, MCP setup, or opencode.jsonc.
---

# Harness maintenance

Rules for changing this OpenCode configuration repository. The global `AGENTS.md`
loads in every project, so it only points here; these rules load when this
repository's configuration is being changed.

## Policy ownership and consistency

- Before changing models, routing, permissions, or workflow gates, identify the authoritative source by file and inspect its consumers in configuration, scripts, agents, commands, tests, and documentation.
- If ownership is undocumented, state which source the change treats as authoritative and why. Resolve conflicting definitions before claiming the change is complete.
- When a policy changes, update affected consumers or verify they remain consistent. Add or update a focused consistency check for machine-readable mappings when an appropriate test layer exists; otherwise report the exact manual comparison performed.

## Plugin and shared runtime changes

- When changing command rewriting, command detection, or tool-event hooks, inspect other plugins that consume or mutate the same fields. Add or update an integration regression test for affected interactions, including original and rewritten commands when applicable. Test relevant hook orders unless ordering is guaranteed by a verified contract.
- Keep reusable runtime logic separate from CLI startup and argument handling when adding or extracting modules. Do not move unrelated code solely to satisfy this rule.
- For changed JavaScript modules imported by plugins, run focused tests of those modules and their plugin boundary. Report whether typechecking includes those modules; a passing plugin-only TypeScript check is not evidence that imported JavaScript contracts were checked.

## Generated and vendored content

- Before editing generated, vendored, or duplicated skills, identify the canonical source and generation or update mechanism. Preserve intentional platform differences.
- Prefer changing the canonical source and regenerating derived files. If no mechanism exists, document which copies were changed and compare them for unintended drift; do not claim synchronization without that comparison.

## Configuration changes

- For changes to OpenCode configuration, agents, plugins, skills, or MCP setup, validate configuration shape first.
- OpenCode must be restarted after configuration-time files change.
