# Required skills on each computer

Keep this checkout in a permanent location on each computer. Its `skills/`
directories remain the maintained sources for `frontend-a11y` and `codescene-mcp`.
The installer also includes their explicit dependency, `modern-web-guidance`.
By default it links only those three directories into `~/.agents/skills`, which both
[OpenCode v2](https://opencode.ai/v2/docs/skills/) and
[Codex CLI](https://developers.openai.com/codex/skills/) discover globally.
The installer does not install agents, commands, MCP servers, or credentials,
and does not modify client configuration or `AGENTS.md`.

## Install and update

Use a [supported Node.js version](../README.md#runtime-requirements) on Linux or
macOS with directory symlink support. Linux was validated; macOS was not tested
here. Windows is not supported by this installation workflow. Run from the
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

## Optional: discover this checkout's OpenSpec skills in other projects

Add `--with-openspec` on each computer where you want the ten maintained OpenSpec
lifecycle skills. This adds links from this checkout's `.agents/skills/openspec-*/`
to the home skill catalogue alongside the three default skills.

```bash
node scripts/install-required-skills.mjs --with-openspec --dry-run
node scripts/install-required-skills.mjs --with-openspec
```

If the dry run reports a conflict, inspect the existing copy or link and preserve
local edits before deciding which source you want. The installer does not replace
it, and a conflict in any selected skill blocks the whole plan. Do not use an
upstream global OpenSpec skill install or refresh to update these managed names;
update this checkout instead. Restart the client if its skill list has not refreshed,
and check which file it resolved when another copy has the same name.

This flag installs **skill links only**. It does not install the OpenSpec CLI,
run `openspec init` or `openspec update`, enable slash commands, or change where
artifacts are written. When a code project must stay free of planning files,
use a separate [registered OpenSpec store](https://github.com/Fission-AI/OpenSpec/blob/v2.1.1/docs/cli.md#stores-standalone-openspec-repos)
with an already installed CLI that supports stores. From the code project,
confirm the store with `openspec store list --json` and read its changes with
`openspec list --store <id>` before any write. Name the store and the code project
separately when invoking the [SDLC workflow](../README.md#openspec-sdlc-workflow).
Do not assume that any skill or command automatically selects the external store.

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

To remove this installation, inspect the relevant links under `~/.agents/skills`
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
broken-link conflicts. The opt-in tests also verify the exact link targets,
preservation of an existing OpenSpec skill, and that an unrelated Git project
remains unchanged.
