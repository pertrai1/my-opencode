# Required skills on each computer

Keep this checkout in a permanent location on each computer. Its `skills/`
directories remain the maintained sources for `frontend-a11y` and `codescene-mcp`.
The installer also includes their explicit dependency, `modern-web-guidance`.
It links all three directories into `~/.agents/skills`, which both
[OpenCode v2](https://opencode.ai/v2/docs/skills/) and
[Codex CLI](https://developers.openai.com/codex/skills/) discover globally.
It does not install the rest of this repository's skills, agents, commands, MCP
servers, or credentials, and does not modify client configuration or `AGENTS.md`.

## Install and update

Use Node.js 22 on Linux or macOS with directory symlink support. Linux was
validated; macOS uses the same Node filesystem APIs but was not tested here.
Windows is not supported by this installation workflow. Run from the
configuration checkout on each computer:

```bash
node scripts/install-required-skills.mjs --dry-run
node scripts/install-required-skills.mjs
```

`--home /absolute/path` selects a different home for an isolated fixture. A dry
run prints the plan and creates nothing. Existing links to the same sources are
left alone. Any conflicting directory, file, or link stops the preflight without
installing any skill; review conflicts manually. There is no overwrite flag.
Do not run multiple installers concurrently.

Pull reviewed changes into the same checkout to update the linked skills; there
is no generated copy to refresh. Rerun the installer to verify links. If you move
the checkout, preserve and review the old links before reinstalling. Deleting the
checkout breaks its links. Restart OpenCode after changes; restart Codex if an
update does not appear.

Existing project skills or higher-priority OpenCode sources can override a skill;
Codex can show duplicate names. Check the discovered path when another definition
already exists. A configuration repository's own `.agents/skills` only applies
within that repository; it does not install skills globally on another computer.

The CodeScene skill's `references/setup.md` symlink points to the repository's
single setup guide. It remains readable through the installed skill path. Keep
Git symlink support enabled when cloning. Do not use a Git checkout that replaces symlinks with plain text files.

## Optional: use OpenSpec across repositories

OpenSpec owns its lifecycle skills. Keep them in the shared
`~/.agents/skills` directory on each computer, not in the configuration checkout
or each project. The required-skills installer above does not manage OpenSpec.

With an installed OpenSpec CLI, first check that `openspec init --help` lists
`--scope` and `openspec update --help` lists `--dry-run`. The commands below
were checked with OpenSpec 2.1.1. Inspect existing `openspec-*` definitions in
your shared, client-specific, and project skill directories first. Preserve
customized files and inspect old links before removing or replacing anything.

Choose a dedicated setup directory outside the code projects you work on. The
example assumes this directory is new or empty:

```bash
setup="$HOME/.local/share/openspec-bootstrap"
mkdir -p "$setup"
openspec init "$setup" --scope global --tools opencode,codex --no-animation
openspec update "$setup" --dry-run --json
```

Initialization writes an `openspec/` directory under the setup directory and
installs the selected profile's skills in the home catalogue. It does not
initialize the code project. Keep the setup directory for refreshes. Before
running an update without `--dry-run`, inspect the preview for profile changes
or removals. The core profile is not the entire workflow set; select optional
workflows in OpenSpec's profile only when needed. This setup does not install
legacy `opsx-*` wrappers.

Restart the clients and check from an unrelated code project that both list the
OpenSpec skills expected for the selected profile. Check that each resolves to
the same shared `SKILL.md` rather than a project or client-specific duplicate.
Listing a skill does not prove an agent will invoke it.

Skill installation and planning-root selection are separate. If the code
project should contain no planning files, use a separate
[registered OpenSpec store](https://github.com/Fission-AI/OpenSpec/blob/v2.1.1/docs/cli.md#stores-standalone-openspec-repos).
From the code project, verify the store explicitly:

```bash
openspec store list --json
store_id="your-registered-store-id"
openspec context --json --store "$store_id"
openspec list --store "$store_id"
```

Confirm that `root.source` is `store` and that `root.store_id` and `root.path`
identify the intended planning directory. For this repository's SDLC workflow,
select `sdlc-orchestrator` in OpenCode and identify both the store and code
checkout. Start by asking it to inspect the change and report the next phase
without writes. Do not assume an upstream skill or command selects the store
or invokes the orchestrator.

## Scope and verification

This installs the two skills `AGENTS.md` requires in every project plus `frontend-a11y`'s explicit
`modern-web-guidance` dependency. The dependency entrypoint and Apache-2.0 license
are vendored from [GoogleChrome/modern-web-guidance at b31dc0a](https://github.com/GoogleChrome/modern-web-guidance/tree/b31dc0a43ff5d19bcf386a3476a216f3b39a6f55).
Local adaptations make research depend on the task and keep disclosure brief:
a mechanical edit that keeps an inspected pattern needs no lookup unless the user
asks for current guidance, and accessibility and browser-support requirements
still apply. The skill
description keeps upstream's trigger list and reason. These policies live in the
vendored entrypoint, so reconcile them deliberately during upstream updates.
Local launcher guidance consistently uses the existing `npx` allowance, even
when `pnpm` is installed; agent permissions are unchanged. Review upstream
changes deliberately before updating that source. Its search and
retrieve commands use `npx -y modern-web-guidance@latest`, matching existing agent
allowlists; this runtime package is fetched at use time and is not pinned by this
installer. npm and network access are required for web guidance. A missing or
failing dependency must be reported as a blocked web-guidance check, not a pass.
CodeScene runtime installation and authentication remain separate setup steps.

To remove this installation, inspect the three links under `~/.agents/skills`
and unlink only those that still point to this checkout. The installer has no
remove or force mode; never delete the source directories or replace unrelated
user-managed skills. Removing `modern-web-guidance` also removes the installed
accessibility skill's web-work dependency, so remove that pair together unless
another maintained copy of the dependency is available.

Linux validation with OpenCode 2.0.27 and Codex CLI 0.159.2 used a clean fixture
home and an unrelated Git project. Both clients discovered the two required skills and their dependency
without a model call. OpenCode's initial
catalogue could be empty while plugins initialized; the subsequent catalogue
contained the installed skills. Discovery does not establish skill execution or CodeScene
authentication.

Installer tests cover a write-free dry run, first installation, repeated runs,
supporting-file resolution, and preservation of directory, file, other-link, and
broken-link conflicts. Only fixture homes were modified during validation.
