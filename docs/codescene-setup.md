# CodeScene setup for OpenCode v2 and Codex CLI

## Default OpenCode registration

`opencode.jsonc` registers `codescene` as `npx -y @codescene/codehealth-mcp@1.5.12`.
The package downloads the `cs-mcp` binary for its own version, so the npm pin also
pins the binary. OpenCode substitutes `CS_ACCESS_TOKEN` from
`~/.secrets/codescene-token` through `{file:}`. Keep that file readable only by
your user (`chmod 600`), and check that it is present without printing it:

```bash
test -s ~/.secrets/codescene-token && echo present
```

A missing file becomes an empty string: the server still connects, but analysis
is unauthenticated. Use `verify_installation` rather than a connection check. To
upgrade, change the version in `opencode.jsonc`, restart OpenCode, and run
`verify_installation` again.

## Hosted Linux installation

The rest of this guide installs the standalone CodeScene MCP server on **Linux x64
with glibc** for hosted environments that inject `CS_ACCESS_TOKEN` as an environment
variable. It preserves `AGENTS.md`. Other platforms should use the
[official installation guide](https://github.com/codescene-oss/codescene-mcp-server/blob/MCP-1.5.10/skills/installing-and-activating-codescene-mcp/SKILL.md).

## Install pinned tools

Prerequisites: Node.js 22, npm 10, Python 3, Git, `curl`, `unzip`, `sha256sum`, and
Codex CLI 0.159.2. Run the following in Bash, choosing a writable permanent
installation directory. Do not run it over an existing installation without
reviewing that installation first.

```bash
codescene_tools="${XDG_DATA_HOME:-$HOME/.local/share}/codescene-tools"
mkdir -p "$codescene_tools/bin" "$codescene_tools/codescene-1.5.10"
env -u CS_ACCESS_TOKEN npm install --prefix "$codescene_tools" \
  --ignore-scripts --no-audit --no-fund \
  @opencode/cli@2.0.27 @opencode/cli-linux-x64@2.0.27

(
  set -e
  cd "$codescene_tools/codescene-1.5.10"
  env -u CS_ACCESS_TOKEN curl --fail --location \
    https://github.com/codescene-oss/codescene-mcp-server/releases/download/MCP-1.5.10/cs-mcp-linux-amd64.zip \
    --output release.zip
  printf '%s  %s\n' \
    6465106eb114d95e7547be6d6b8e18acc783fe3f408618bd346113b0b97602e0 \
    release.zip | sha256sum --check -
  unzip -j release.zip cs-mcp-linux-amd64 cs-mcp-linux-amd64.sha256 -d .
  sha256sum --check cs-mcp-linux-amd64.sha256
)
```

The archive SHA-256 is pinned from GitHub's separately published
[release asset metadata](https://api.github.com/repos/codescene-oss/codescene-mcp-server/releases/assets/624942876)
for MCP 1.5.10, checked on 2026-10-13. A download or archive-check failure stops
this subshell before extraction. The checksum inside the ZIP checks internal
consistency only. The pinned archive digest establishes a match to the bytes
published by GitHub; it is not an independent source/build provenance attestation.

**Stop if any installation command fails.** Otherwise, expose the installed binaries:

```bash
chmod u+x "$codescene_tools/codescene-1.5.10/cs-mcp-linux-amd64"
ln -s ../codescene-1.5.10/cs-mcp-linux-amd64 "$codescene_tools/bin/cs-mcp"
ln -s ../node_modules/@opencode/cli-linux-x64/bin/opencode "$codescene_tools/bin/opencode"
export PATH="$codescene_tools/bin:$PATH"
```

The explicit native package avoids the npm installer's platform-selection failure
observed during validation. `opencode-ai` is v1, not the v2 package.

If the normal home directories are read-only, use writable client state locations
for this isolated setup before running either client:

```bash
export XDG_CONFIG_HOME="$codescene_tools/config"
export XDG_DATA_HOME="$codescene_tools/data"
export XDG_CACHE_HOME="$codescene_tools/cache"
export XDG_STATE_HOME="$codescene_tools/state"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME"
```

These overrides select a separate client configuration; they do not import an
existing user's settings. Keep normal locations when they are writable.
Check the installed versions without passing the subscription token:

```bash
env -u CS_ACCESS_TOKEN opencode --version
env -u CS_ACCESS_TOKEN cs-mcp --version
env -u CS_ACCESS_TOKEN cs-mcp --cli-version
```

Expected: OpenCode 2.0.27, MCP 1.5.10, bundled CLI 1.0.52.

## Connect the existing clients

Keep `CS_ACCESS_TOKEN` in the environment's secret facility. Never copy its value
into configuration, arguments, logs, or the image. Start clients after secret
injection; restart an existing OpenCode service so it inherits the variable.

For OpenCode in that environment, update only the existing `mcp.servers.codescene`
entry to launch the installed binary and read the injected variable instead of the
local token file. Preserve the surrounding settings:

```json
{
  "type": "local",
  "command": ["cs-mcp"],
  "environment": { "CS_ACCESS_TOKEN": "{env:CS_ACCESS_TOKEN}" }
}
```

Ensure the client starts with the `PATH` above, or replace `cs-mcp` with the
absolute path printed by `command -v cs-mcp`. Do not add a duplicate entry. V2
connects by default; `disabled: true` disables a server. Run `opencode mcp list`
from the configured repository to check connection status.

For Codex, inspect `codex mcp list` first and merge this entry into the intended
`config.toml`, preserving other servers and all sandbox/approval settings:

```toml
[mcp_servers.codescene]
command = "cs-mcp"
env_vars = [
  "CS_ACCESS_TOKEN",
  "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME"
]
```

The XDG names forward the optional writable state locations above to the MCP
subprocess; omitting them can leave the bundled CLI trying to write to a
read-only home. No variable values are stored in this configuration.

If Codex's default home is read-only, select a new writable home:

```bash
codescene_codex_home="$codescene_tools/codex"
mkdir -p "$codescene_codex_home"
export CODEX_HOME="$codescene_codex_home"
```

Create `$CODEX_HOME/config.toml` with the MCP entry above. For this fresh isolated
configuration, place `sandbox_mode = "read-only"` and
`approval_policy = "on-request"` before the MCP table. Do not copy credentials or
restricted session files from another home. This does not add CodeScene to a
hosted task's native tools.

## Verify and persist

Check whether the token variable name is present without retrieving its value:

```bash
python3 -c 'import os; print("CS_ACCESS_TOKEN" in iter(os.environ))'
```

Iterating the names avoids the mapping membership implementation retrieving a
value internally. A `True` result establishes presence only; the value might be empty or invalid.
Use `verify_installation` with the repository root, then `code_health_score` on a
small local source fixture. A connection check alone does not validate licensed
analysis. The [codescene-mcp skill](../skills/codescene-mcp/SKILL.md) supplies the
repository's post-edit and pre-finish workflow. No CodeScene Core setup is needed.

Verification on 2026-10-12/13 established:

- OpenCode 2.0.27 connected and discovered 21 tools, including `code_health_score`.
- Codex 0.159.2 discovered 21 tools and returned Code Health 10 for a JavaScript
  fixture through `mcpServer/tool/call`, without a model call. Direct MCP and
  bundled CLI analysis returned the same score.
- `verify_installation` returned five PASS checks against PR #75's merged main.

**OpenCode fixture execution is not verified.** Its documented HTTP API and
published 2.0.27 client/SDK expose MCP management and discovery, but no direct MCP
tool-call method. No internal API or fabricated plugin context was used. The
21-tool authenticated catalogue differs from the 28-tool unauthenticated one by
Core-specific tools, consistent with standalone capability filtering.

To persist the setup, put the pinned installation steps, `PATH`/state locations,
and value-free client configuration in the environment's supported setup or image
build mechanism. Keep the token in its secret store. Save/republish that environment
through its normal controls, then verify in a fresh task. Do not assume arbitrary
workspace files or a running daemon are captured. This PR does not republish an
environment or modify vault settings.

## References

- [OpenCode v2 installation](https://opencode.ai/v2/docs/)
- [OpenCode v2 MCP configuration](https://opencode.ai/v2/docs/mcp-servers/)
- [OpenCode v2 public API](https://opencode.ai/v2/docs/api)
- [Codex configuration and state locations](https://developers.openai.com/codex/config-advanced/)

API evidence: `@opencode/client` 2.0.27 `dist/promise/generated/client.d.ts`,
`@opencode/sdk` 2.0.27 `dist/promise.d.ts`, and `@opencode/plugin` 2.0.27
`dist/promise/mcp.d.ts`. The published MCP interfaces expose no direct invocation.
