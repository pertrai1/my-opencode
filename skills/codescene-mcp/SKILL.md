---
name: codescene-mcp
description: Use for Code Health reviews, regression handling, and pre-finish safeguards on AI-modified code using standalone CodeScene MCP.
---

# CodeScene MCP

Follow the user's scope and repository `AGENTS.md` first. Use the existing
`codescene` registration and [setup guide](references/setup.md).
This skill does not authorize commits, pushes, broader refactoring, or changes to
credentials or permissions.

## Review changed code

1. Review each changed, supported source file with `code_health_review` after
   editing. Record a baseline when available and aim for Code Health 10 without
   changing behavior or expanding scope.
2. Address regressions in small steps, rerunning the review and relevant tests.
   Report findings that require broader work; do not present an unaccepted
   regression as a pass.
3. Before declaring code changes ready, run `pre_commit_code_health_safeguard`
   with the repository root. Before a PR-oriented recommendation, also run
   `analyze_change_set` against the verified base ref.
4. Report checks, results, and remaining risks. Unavailable tools, unsupported
   languages, and unscorable files are not passing results. Documentation-only
   changes use the repository's documentation checks.

## Authentication and availability

The `codescene` registration supplies `CS_ACCESS_TOKEN`: from
`~/.secrets/codescene-token` by default, or from the environment in hosted setups.
Never read or print the token or its file, persist its value, dump the environment,
or include credentials in arguments or logs. Use `verify_installation` with the
repository root for diagnosis. Stop dependent analysis on authentication failure
and report the blocker safely.

This setup uses standalone Code Health capabilities. Do not configure Core
projects, account IDs, or on-premises URLs, or call Core APIs to probe entitlement.
A connected transport establishes discovery, not successful licensed analysis.

## Upstream references

Based on CodeScene MCP 1.5.10's [standalone guidance](https://github.com/codescene-oss/codescene-mcp-server/blob/MCP-1.5.10/docs/AGENTS-standalone.md),
[safeguard workflow](https://github.com/codescene-oss/codescene-mcp-server/blob/MCP-1.5.10/skills/safeguarding-ai-generated-code/SKILL.md),
and [refactoring workflow](https://github.com/codescene-oss/codescene-mcp-server/blob/MCP-1.5.10/skills/guiding-refactoring-with-code-health/SKILL.md).
Copyright CodeScene AB; upstream open-source material is provided under
[Apache License 2.0](https://github.com/codescene-oss/codescene-mcp-server/blob/MCP-1.5.10/LICENSE).
These links supplement local rules; do not replace `AGENTS.md` with upstream text.
