# CLI tool catalog

This catalog records tools relevant to this OpenCode configuration. It is a
discovery record, not permission: an agent can run a tool only when its active
permission rules allow the exact operation. The [CLI-first workflow](cli-first.md)
is the short, always-loaded policy.

## Discovery method and limits

The inventory was collected on 2026-09-05 from executable PATH lookup, the
repository manifest and local `node_modules/.bin`, global npm inventory,
repository scripts, agent/command instructions, plugins, and README references.
Availability means the named executable or package was found by that method; it
does not demonstrate authentication, a running service, a successful network
request, or agent permission. Version checks and service startup were not run as
part of this inventory.

Interactive tools are marked because they are useful to a human but should not
be selected for unattended agent automation. `npx` and `uvx` can download a
package on first use, so an on-demand entry is not an installed dependency.

## Selection rules

- Reuse an existing script or CLI before adding a tool with overlapping scope.
- Prefer structured output (`--json`, SARIF, or an explicit report file) for
  automation when the tool supports it.
- Use REST only when a supported CLI cannot complete the needed operation.
- Before adding a candidate, verify its current official documentation, platform
  support, license, credentials, and maintenance cost. Do not add scanners to
  every repository without a demonstrated need.

## Agent capability matrix

MCP namespaces are denied globally: `mdn_*`, `llm-core_*`, `sonarqube_*`, and
`agentmemory_*`. `build` and `plan` explicitly restore them. The matrix records
the effective intended policy; agent-specific file and shell rules remain the
source of truth for whether an invocation is permitted.

| Agent | Role and permitted CLI fit | MCP policy | Decision |
| --- | --- | --- | --- |
| `lean` | Routine local work; only its existing local-tool and shell permissions. | All optional namespaces denied. | Strict default; route MCP work. |
| `build` | General implementation and verification. | All four namespaces allowed. | Broad access is justified for full-tool work. |
| `plan` | Planning and codebase reasoning. | All four namespaces allowed. | Broad access is justified for research and planning. |
| `explore` | Read-only reconnaissance with its allowlisted read-only shell commands. | Denied by its `*` rule and global policy. | No change; shell and edit limits remain. |
| `sdlc-orchestrator` | Lifecycle routing and narrow status/check commands. | Global deny. | No MCP is needed for documented orchestration. |
| `tdd-orchestrator` | TDD coordination and narrow test/typecheck commands. | Global deny. | No MCP is needed for documented coordination. |
| `implementer` | Implementation and allowlisted verification commands. | Global deny. | Local tools meet the documented role. |
| `type-author` | Type-contract authoring and narrow checks. | Global deny. | No MCP is needed. |
| `test-author` | Test authoring and test commands. | Global deny. | No MCP is needed. |
| `proposal-author` | Proposal-only writing. | Global deny. | No MCP is needed. |
| `spec-author` | Delta-spec-only writing. | Global deny. | No MCP is needed. |
| `design-author` | Design-only writing. | Global deny. | No MCP is needed. |
| `task-planner` | `tasks.md` authoring. | Global deny. | No MCP is needed. |
| `spec-syncer` | Scoped spec synchronization. | Global deny. | No MCP is needed. |
| `change-verifier` | Change-local verification reporting. | Global deny. | No MCP is needed. |
| `architecture-reviewer` | Read-only architectural review. | Global deny. | No MCP is needed. |
| `architecture-boundary-reviewer` | Read-only changed-edge review. | Global deny. | No MCP is needed. |
| `performance-reviewer` | Read-only performance review. | Global deny. | No MCP is needed. |
| `production-readiness-reviewer` | Read-only production-safety review. | Global deny. | No MCP is needed. |
| `test-reviewer` | Read-only test-coverage review. | Global deny. | No MCP is needed. |
| `prompt-agent` | Prompt/workflow design. | Global deny. | No MCP is needed. |

## MCP visibility inventory

This is a configuration inventory, not a live service probe. The baseline is
the configuration before this change: `lean` named twelve known MDN, llm-core, and
agentmemory tools individually, while SonarQube could become visible when its
project activation plugin enabled it. The new prefix rules also cover later
tools in the same namespaces. OpenCode 1.18.28 resolved the changed
configuration successfully through `opencode debug config`; live MCP
connectivity was not tested because it depends on service and credential state.

| Namespace | Known baseline tool names | Before | After: default agents including `lean` | After: `build` and `plan` |
| --- | --- | --- | --- | --- |
| `mdn_*` | `mdn_search`, `mdn_get-doc`, `mdn_get-compat` | 3 individually denied by `lean`; other agents inherited access. | Entire namespace denied. | Entire namespace allowed. |
| `llm-core_*` | `llm-core_get_active_instructions`, `llm-core_lint_file` | 2 individually denied by `lean`; other agents inherited access. | Entire namespace denied. | Entire namespace allowed. |
| `sonarqube_*` | Tool names are conditional and unverified; server activates only for a valid target project. | Not denied by `lean` when active. | Entire namespace denied. | Entire namespace allowed when the plugin activates it. |
| `agentmemory_*` | `agentmemory_memory_audit`, `agentmemory_memory_export`, `agentmemory_memory_governance_delete`, `agentmemory_memory_recall`, `agentmemory_memory_save`, `agentmemory_memory_sessions`, `agentmemory_memory_smart_search` | 7 individually denied by `lean`; no static `mcp` entry in `opencode.jsonc`. | Entire namespace denied. | Entire namespace allowed when supplied by the active environment. |

The known baseline list contains 12 named tools. It is not a total connected-tool
count: SonarQube and agentmemory depend on runtime conditions. Re-run `opencode
debug config` after a configuration change and inspect active MCP servers in the
intended target project before claiming live visibility or token savings.

## Available tools

| Area | Tool and availability | Use, fit, and safe example | Prerequisites and overlap |
| --- | --- | --- | --- |
| Repository | `rtk` — PATH | Token-aware command wrapper. `rtk git status`. Suitable wherever shell policy permits. | Existing workflow standard; do not use it to evade denied commands. |
| Repository | `git`, `rg`, `fd`, `jq`, `ast-grep` — PATH | Repository state, search, file discovery, structured JSON, and syntax-aware search. `rg --files`; `ast-grep run --pattern 'console.log($A)'`. | No MCP replacement needed for routine local work. `sg` was found but its identity was not verified and is excluded from recommendations. |
| GitHub and HTTP | `gh`, `curl`, `wget` — PATH | GitHub operations and direct HTTP. `gh issue view 26`; `curl --fail-with-body URL`. | `gh auth status` determines GitHub readiness. Prefer `gh` to REST when it supports the action. |
| JavaScript | `node`, `npm`, `npx`, `pnpm`, `bun`, `bunx` — PATH | Run project scripts and package executables. `npm run typecheck`; `pnpm test`. | `npx`/`bunx` may install on demand. Use the target project's declared package manager. |
| Python | `python3`, `uv`, `uvx` — PATH | Python execution and managed tools. `uvx --from PACKAGE TOOL --help`. | `uvx` may install on demand; prefer a target project's environment. |
| Project checks | `checks-runner.mjs`, `quality-verification.mjs`, `halstead-analyzer.js`, `ubs.sh` — repository scripts | Baseline checks, changed-file quality evidence, Halstead analysis, and this repo's check sequence. `node scripts/checks-runner.mjs`; `node scripts/quality-verification.mjs --changed`. | Existing scripts; do not infer that target repositories support every check. Quality verification invokes Fallow on demand when selected. |
| JS/TS linting | project-local `tsc`, `eslint`; `biome` — PATH | Typecheck/lint according to project config. `npm run lint`; `biome check .`. | This repository already uses ESLint and TypeScript. Biome is available but not adopted; defer unless a project chooses it. |
| Analysis | `fallow`, `ubs` — PATH | Fallow backs quality checks; `ubs` is an external executable in addition to this repo's `npm run ubs`. | Use existing quality scripts first. External `ubs` identity and project fit remain unverified. |
| Code intelligence | `gitnexus`, `code-review-graph` — PATH | Dependency/impact analysis and local code-review graph. `gitnexus --help`; `code-review-graph --help`. | Use for large/unfamiliar repositories when ordinary search is insufficient. Service/index health is unverified. |
| Review UI | `difit`, `diffity`, `hunk`, `lazygit` — PATH; interactive | Human-oriented diff and Git review. `difit --help`; `lazygit`. | Interactive tools are not default unattended-agent tools. `hunk` is supplied by the `hunkdiff` npm package. |
| Container and local models | `docker`, `magnitude`, `ollama` — PATH; `lazydocker` — PATH and interactive | Containers and local model service/model management. `magnitude catalog status`; `ollama list`. | Docker daemon and local services are not verified. Preserve existing Magnitude workflow. |
| OpenCode workflows | `opencode`, `openspec`, `cass` — PATH | OpenCode control, OpenSpec workflow, and available CASS executable. `opencode debug config`; `openspec status`; `cass --help`. | CASS executable availability does not establish integration; track integration in issue #20. |
| Global package inventory | `codex`, `gemini`, `copilot`, `pi`, `openclaw`, `clawhub`, `mcp-hub`, `oh-my-opencode`, `opencode-swarm-plugin`, and related packages — npm-global inventory | Alternative agent/harness ecosystems were discovered. | Out of scope for this configuration; do not add or route work through them without a separate decision. Some package names do not equal a PATH executable. |
| Referenced but missing/unverified | `gh-dash`, `graphify`, `knip`, `jscpd`, `skills` — documented/reference status | Consider only for their named use cases. `npx skills update` is documented but is on-demand unless otherwise verified. | Verify identity and need before installation. Graphify is a local skill, not a verified CLI. |

## MCP capability decisions

| MCP namespace | CLI/script mapping | Retention decision |
| --- | --- | --- |
| `mdn_*` | No equivalent assumed. Browser-compatible MDN reference is distinct from a local CLI. | Retain for `build`/`plan`; route documentation/reference work there. |
| `llm-core_*` | This repository's `eslint` configuration uses `eslint-plugin-llm-core`; a direct local lint command can cover configured lint rules. | Retain MCP only for its specialized interactive operations; ordinary linting uses `npm run lint`. |
| `sonarqube_*` | `sonar-scanner` is a candidate for submitting analysis, but it does not replace remote findings, project administration, or server queries. | Retain for `build`/`plan` when a valid SonarQube project activates the server. |
| `agentmemory_*` | No equivalent assumed. Local text search cannot replace persistent memory semantics. | Retain for `build`/`plan`; existing `/recall` and `/remember` commands use it. |

## Candidates to assess before adding

| Candidate | Gap and disposition | Official source and example |
| --- | --- | --- |
| [yq](https://github.com/mikefarah/yq) | Add when a real YAML/JSON transformation needs more than `jq`; currently defer. macOS installation and exact package manager choice need validation. | `yq e '.key' config.yaml`; structured local transformation. |
| [Semgrep](https://semgrep.dev/docs/) | Add when a repository needs rule-based SAST beyond existing linting; defer. Requires policy/rule ownership and may require account setup for `ci`. | `semgrep ci --json --json-output=semgrep.json`. |
| [Gitleaks](https://github.com/gitleaks/gitleaks) | Add when a repository needs repeatable secret scanning; defer until policy and baselines are chosen. | `gitleaks git --report-format json --report-path=gitleaks.json`. |
| [Trivy](https://trivy.dev/) | Add when dependency, filesystem, image, or IaC scanning is needed; defer. It overlaps Gitleaks secrets scanning. | `trivy fs --format json .`. |
| [ShellCheck](https://www.shellcheck.net/) | Add when shell scripts become a maintained surface; add when needed. | `shellcheck scripts/*.sh`. |
| [actionlint](https://github.com/rhysd/actionlint) | Add when `.github/workflows` changes merit local workflow validation; add when needed. | `actionlint`. |
| [markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2) | Add when Markdown consistency needs an enforced rule set; defer because this repo has no configuration. | `markdownlint-cli2 "**/*.md" "#node_modules"`. |
| [Prettier](https://prettier.io/docs/) | Use only in repositories that adopt a Prettier configuration; do not add beside the current formatter without a style decision. | `npx prettier . --check`. |
| [Playwright CLI](https://github.com/microsoft/playwright-cli) | Add when browser automation is a concrete requirement; defer. It can be CLI-first browser automation, but requires browser/runtime setup. | `npm install -g @playwright/cli@latest`; `playwright-cli open`. |
| [SonarScanner CLI](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/scanners/sonarscanner) | Add only when target projects need analysis submission outside the configured MCP path; defer. Requires server URL, project configuration, and credentials. | `sonar-scanner`. |

These candidate references were checked against current primary documentation on
2026-09-05. They are not installation instructions for this workspace; validate
the selected target's operating system, package manager, licensing, and security
requirements before use.
