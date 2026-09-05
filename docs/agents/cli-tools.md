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
request, or agent permission. A non-mutating `--version` snapshot is recorded
below. The login shell resolved Node differently from the active test runtime,
so version-sensitive invocations must record their own runtime before use.

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

| Agent | Required permitted CLI operations | MCP need | Removed exposure and rationale |
| --- | --- | --- | --- |
| `lean` | Local OpenCode tools and permitted shell commands such as `rg`, Git, `gh`, and declared project scripts. | None by default. | `mdn_*`, `llm-core_*`, `sonarqube_*`, and `agentmemory_*` are hidden to keep routine work small; route a demonstrated need. |
| `build` | Full implementation tooling, repository scripts, and permitted local shell commands. | All four namespaces. | No removal: broad access supports general implementation, diagnostics, documentation, memory, and project-integrated SonarQube work. |
| `plan` | Repository inspection, Git history/diff, checks, and planning commands. | All four namespaces. | No removal: planning may need documentation, memory, and high-level diagnostics. |
| `explore` | `ls`, `pwd`, `cat`, `head`, `tail`, `rg`, `grep`, and read-only Git commands listed in its front matter. | None. | All four namespaces remain hidden; its read-only `*` deny protects reconnaissance boundaries. |
| `sdlc-orchestrator` | `git status/diff`, `npm` checks, quality/checks runners, and allowlisted `openspec` lifecycle commands. | None. | All four namespaces removed; orchestration delegates specialized capability work. |
| `tdd-orchestrator` | `git status/diff`, package-manager test/typecheck commands, checksums, and quality runner. | None. | All four namespaces removed; it delegates code and keeps coordination independent. |
| `implementer` | Allowlisted package-manager tests, typecheck, lint, formatter checks, and quality/Halstead runners. | None. | All four namespaces removed; implementation has local verification tools and routes specialized research. |
| `type-author` | `tsc`, project typecheck, `mypy`, and `pyright` when configured. | None. | All four namespaces removed; type contract work needs no external tool schema. |
| `test-author` | Allowlisted package-manager, Vitest, Jest, and Pytest test commands. | None. | All four namespaces removed; RED work remains limited to test-facing evidence. |
| `proposal-author` | No shell commands; proposal-file editing only. | None. | All four namespaces removed; no documented MCP or CLI requirement. |
| `spec-author` | No shell commands; delta-spec editing only. | None. | All four namespaces removed; no documented MCP or CLI requirement. |
| `design-author` | No shell commands; design-file editing only. | None. | All four namespaces removed; no documented MCP or CLI requirement. |
| `task-planner` | No shell commands; `tasks.md` editing only. | None. | All four namespaces removed; no documented MCP or CLI requirement. |
| `spec-syncer` | No shell commands; scoped main-spec editing only. | None. | All four namespaces removed; no documented MCP or CLI requirement. |
| `change-verifier` | No shell commands; consumes supplied evidence and writes verification artifacts. | None. | All four namespaces removed; verification preserves read-only evidence boundaries. |
| `architecture-reviewer` | No shell commands; read-only diff/design review. | None. | All four namespaces removed; no documented MCP or CLI requirement. |
| `architecture-boundary-reviewer` | No shell commands; read-only dependency-edge review. | None. | All four namespaces removed; no documented MCP or CLI requirement. |
| `performance-reviewer` | No shell commands; read-only performance review. | None. | All four namespaces removed; no documented MCP or CLI requirement. |
| `production-readiness-reviewer` | No shell commands; read-only operational-risk review. | None. | All four namespaces removed; no documented MCP or CLI requirement. |
| `test-reviewer` | No shell commands; read-only test-coverage review. | None. | All four namespaces removed; no documented MCP or CLI requirement. |
| `prompt-agent` | `pwd`, `ls`, and read-only Git inspection listed in its front matter. | None. | All four namespaces removed; prompt/workflow edits do not need them. |

## MCP visibility inventory

This section separates configured policy from observed live state. The baseline
configuration named twelve known MDN, llm-core, and agentmemory tools
individually for `lean`; SonarQube could become visible when its project
activation plugin enabled it. The new prefix rules cover later tools in the same
namespaces.

| Namespace | Known baseline tool names | Configured default-agent policy after this change | Configured `build`/`plan` policy after this change |
| --- | --- | --- | --- |
| `mdn_*` | `mdn_search`, `mdn_get-doc`, `mdn_get-compat` | Entire namespace denied. | Entire namespace allowed. |
| `llm-core_*` | `llm-core_get_active_instructions`, `llm-core_lint_file` | Entire namespace denied. | Entire namespace allowed. |
| `sonarqube_*` | Tool names are conditional and unverified; server activates only for a valid target project. | Entire namespace denied. | Entire namespace allowed when the plugin activates it. |
| `agentmemory_*` | `agentmemory_memory_audit`, `agentmemory_memory_export`, `agentmemory_memory_governance_delete`, `agentmemory_memory_recall`, `agentmemory_memory_save`, `agentmemory_memory_sessions`, `agentmemory_memory_smart_search` | Entire namespace denied. | Entire namespace allowed when supplied by the active environment. |

Observed with OpenCode 1.18.28 after this change: `opencode debug config`
resolved the configuration; `opencode mcp list` reported MDN and llm-core
connected, SonarQube disabled, and no agentmemory server. `opencode debug agent
lean --tool mdn_search --params '{}'` and the same command for `build` both
reported that the tool was not found. Therefore this run does not establish a
live per-agent tool count, tool-schema size, or `build`/`plan` MDN availability.

The installed CLI has no command that lists resolved tool schemas by agent. To
finish live verification, run in a target with each required server connected:

1. `opencode mcp list` to record server status.
2. `opencode debug agent <agent> --tool <actual-tool-id> --params '<read-only JSON>'` for `lean`, one specialist, `build`, and `plan`.
3. Run the same check in a temporary target without `sonar-project.properties`
   and in a target with a valid `sonar.host.url` and `sonar.projectKey`.
4. Record the returned tool IDs/counts and serialized schema byte counts when
   the server or host exposes them. Do not claim token savings from this config
   alone.

The known baseline list contains 12 named tools, not a total connected-tool
count. The automated tests separately verify the rule-resolution model and both
SonarQube project activation states using isolated fixtures.

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

## Per-tool metadata snapshot

The snapshot below is the requested per-tool evidence. `PATH` means the
executable resolved in the login shell. “Provenance unrecorded” explicitly means
the inventory cannot establish how the existing host installation was obtained.
For those entries, use the linked official project documentation or the target
repository's package manager rather than treating this catalog as an installer.

| Tool | Executable/package identity and version | Install/provenance | Prerequisites and automation | Role fit |
| --- | --- | --- | --- | --- |
| `rtk` | `rtk` 0.46.0, PATH | Existing workflow; provenance unrecorded. | No auth; noninteractive terminal output. | Any permitted shell workflow. |
| `git` | Git 2.55.0, PATH | Platform package; provenance unrecorded. | Repository access; text/porcelain output. | Repository inspection and allowed Git actions. |
| `gh` | GitHub CLI 2.98.0, PATH | Official GitHub CLI install method must be selected per host. | `gh auth status`; JSON output supported. | GitHub operations where agent permission allows. |
| `rg` | ripgrep 15.2.0, PATH | Platform package; provenance unrecorded. | No auth; `--json` supported. | Search for `lean`, `build`, `plan`, and read-only agents. |
| `fd` | fd 10.5.0, PATH | Platform package; provenance unrecorded. | No auth; line-delimited output. | File discovery where shell policy permits. |
| `jq` | jq 1.8.2, PATH | Platform package; provenance unrecorded. | No auth; JSON input/output. | Structured local and REST response handling. |
| `curl` | curl 8.7.1, PATH | Platform package; provenance unrecorded. | Network/auth depend on endpoint; write only with authorization. | Direct REST fallback. |
| `wget` | GNU Wget 1.25.0, PATH | Platform package; provenance unrecorded. | Network/auth depend on endpoint. | Download/read workflows when permitted. |
| `ast-grep` | ast-grep 0.45.2, PATH | Official ast-grep installation must be selected per host. | No auth; structured JSON available. | Syntax-aware code search. |
| `node` | 26.8.1 in login shell; active test runtime may differ. | Node version manager is present; exact selection is shell-dependent. | No auth; script/JSON output depends on script. | Repository scripts and JS tooling. |
| `npm` / `npx` | npm/npx 11.19.0 in login shell | Bundled with resolved Node runtime. | `npx` may download packages. | Declared npm scripts and explicit on-demand tools. |
| `pnpm` | pnpm 11.14.0, PATH | Global package; provenance unrecorded. | No auth; project lockfile/package-manager required. | Target repositories declaring pnpm. |
| `bun` / `bunx` | Bun/Bunx 1.4.0, PATH | Global runtime; provenance unrecorded. | `bunx` may download packages. | Target repositories declaring Bun. |
| `python3` | Python 3.14.7, PATH | Platform/runtime manager; provenance unrecorded. | No auth; environment-specific dependencies. | Python project tooling. |
| `uv` / `uvx` | uv/uvx 0.9.18, PATH | Official Astral install method must be selected per host. | `uvx` may download packages. | Managed Python tools when target chooses uv. |
| `fallow` | npm package `fallow` 3.16.0, PATH | Globally installed; quality runner also invokes it on demand. | No auth; `--format json` supported. | Selected changed-file quality checks. |
| `ubs` | UBS Meta-Runner 5.3.2, PATH | Existing local executable; provenance unrecorded. | No auth; project fit unverified. | Do not select over `npm run ubs` without target evidence. |
| `biome` | `@biomejs/biome` 2.4.6, PATH | Global npm package; provenance unrecorded. | No auth; JSON reporter available. | Only repositories configured for Biome. |
| `gitnexus` | npm package `gitnexus` 1.5.3, PATH | Global npm package; provenance unrecorded. | Local index/service state required; health unverified. | Large-repository impact analysis. |
| `code-review-graph` | code-review-graph 2.3.7, PATH | Existing project integration; provenance unrecorded. | Local graph/index state required; health unverified. | Review graph work. |
| `difit` / `diffity` / `hunk` | difit 5.0.4; diffity 0.9.5; hunk 0.18.1, PATH | Global npm packages; `hunk` comes from `hunkdiff`. | Interactive; do not use for unattended automation. | Human diff review. |
| `lazygit` / `lazydocker` | lazygit 0.64.1; lazydocker 0.25.2, PATH | Platform package; provenance unrecorded. | Interactive; Docker daemon for lazydocker. | Human Git/container review. |
| `docker` | Docker 29.4.0, PATH | Docker Desktop/platform install; provenance unrecorded. | Running daemon and registry access required. | Existing SonarQube MCP launch and container workflows. |
| `magnitude` | `@magnitudedev/cli` 0.0.11, PATH | README documents global npm installation. | Local service/model assets required. | Existing local-model workflow. |
| `ollama` | Executable resolved; daemon unavailable during check. | Official Ollama installer required; provenance unrecorded. | Running daemon and local models required. | Existing local-model provider. |
| `opencode` | OpenCode 1.18.28, PATH | Existing application install. | Config, providers, and server auth vary; debug commands are non-mutating. | OpenCode operation and config validation. |
| `openspec` | `@fission-ai/openspec` 1.11.0, PATH | Global npm package; provenance unrecorded. | OpenSpec store/repository required. | Existing lifecycle workflow. |
| `cass` | cass 0.6.5, PATH | Existing local executable; provenance unrecorded. | Index/session configuration required; integration unverified. | Candidate for issue #20 only. |
| Project-local `tsc` / `eslint` | TypeScript 6.0.3 and ESLint 10.8.1 from this repo manifest. | Project `devDependencies`. | `npm ci`-style dependencies present; machine-readable reports vary. | This repository's typecheck and lint scripts. |
| Repository scripts | `checks-runner.mjs`, `quality-verification.mjs`, `halstead-analyzer.js`, `ubs.sh`. | Versioned in this repository. | Target-specific package scripts/lockfiles; reports written under `.agents/reports`. | Existing verification workflow. |

`gh-dash`, `graphify`, `knip`, `jscpd`, and the `skills` CLI remain documented
but unverified: no executable/version was found in this pass. Treat them as
on-demand or candidate tools, not installed tools. The global npm inventory also
contains unrelated agent ecosystems; they are intentionally excluded from the
per-tool table because they do not serve this configuration's workflow.

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
