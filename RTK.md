# RTK - Rust Token Killer

[RTK](https://github.com/rtk-ai/rtk) filters supported command output to reduce
context usage. Check local savings with `rtk gain`; savings depend on the commands
and output.

## Check installation

```bash
command -v rtk
rtk --version
rtk gain
```

If `rtk gain` is unavailable, check that the installed binary is `rtk-ai/rtk`,
not the unrelated Rust Type Kit.

## OpenCode integration

`plugins/rtk.ts` handles OpenCode's `shell` and `bash` tool calls. It uses
`rtk hook opencode` to propose a rewrite without changing the agent's or
session's shell permission decision. The plugin gives RTK the effective
OpenCode rules in a temporary JSON file, so RTK doesn't need to parse the
checkout's JSONC. The command itself still runs in its requested working
directory and goes through OpenCode's native permission checks.

Install a version of RTK that provides `rtk hook opencode` (verified with RTK
1.1.0). If it is missing, the plugin logs a warning and leaves commands alone.
Unsupported commands, permission-sensitive rewrites, and rewrite errors or
timeouts also keep the original command. Set `RTK_DISABLED=1` in the
OpenCode process environment to disable rewriting.

This checkout manages the plugin; `rtk init -g --opencode` can overwrite it.
OpenCode reloads local plugin changes. Use `/reload` to reload configuration
after installing RTK if the plugin was previously disabled.

## Direct commands

```bash
rtk gain              # Show local savings analytics
rtk gain --history    # Show command history and savings
rtk proxy <cmd>       # Run without output filtering when debugging
rtk --help            # Show the installed version's command reference
```
