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

`plugins/rtk.ts` checks for `rtk` on startup and sends `bash` and `shell` command
strings to `rtk rewrite` in the session repository before execution. It uses a nonempty rewritten command
when RTK allows it (exit 0). An explicit RTK deny (exit 2) blocks execution.
An RTK ask (exit 3) keeps the original command and follows OpenCode's native
shell permissions; RTK does not independently require approval. Existing deny
rules remain effective. Rewrites have a 10-second timeout; a stalled RTK process
is terminated, and the original command follows OpenCode permissions. Other
rewrite failures also leave the original command to OpenCode permissions.
If the binary is missing, the plugin logs a warning and disables itself.

Restart OpenCode after installing RTK or changing the plugin. This integration
uses an OpenCode tool hook; it does not require a Claude Code hook.

## Direct commands

```bash
rtk gain              # Show local savings analytics
rtk gain --history    # Show command history and savings
rtk proxy <cmd>       # Run without output filtering when debugging
rtk --help            # Show the installed version's command reference
```
