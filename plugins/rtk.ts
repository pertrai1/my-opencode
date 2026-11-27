import { Plugin } from "@opencode/plugin"
import type { Permission } from "@opencode/schema/permission"
import { execFile } from "node:child_process"
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { isShellTool } from "../lib/shell-command.ts"
import { shellWorkingDirectory } from "../lib/shell-workdir.ts"

const execFileAsync = promisify(execFile)
const rewriteTimeoutMs = 10_000

function getCommandArgs(args: unknown): Record<string, unknown> | null {
  if (!args || typeof args !== "object") return null
  return args as Record<string, unknown>
}

async function rewrite(command: string, permissions: Permission.Ruleset): Promise<string | undefined> {
  const directory = await mkdtemp(join(tmpdir(), "opencode-rtk-"))
  try {
    // Keep RTK's config discovery in this directory so it judges the effective
    // rules once resolved by OpenCode, including agent and session overrides.
    const config = join(directory, "opencode.json")
    await writeFile(config, JSON.stringify({ permissions }), { mode: 0o600 })
    const { stdout, stderr } = await execFileAsync("rtk", ["hook", "opencode", "--", command], {
      cwd: directory,
      env: { ...process.env, OPENCODE_CONFIG: config },
      timeout: rewriteTimeoutMs,
      killSignal: "SIGKILL",
    })
    if (stderr.trim()) return undefined
    const result: unknown = JSON.parse(stdout)
    const rewritten = getCommandArgs(result)?.command
    return typeof rewritten === "string" ? rewritten.trim() : undefined
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export default Plugin.define({
  id: "rtk",
  async setup(ctx) {
    try {
      await execFileAsync("rtk", ["hook", "opencode", "--help"], { timeout: rewriteTimeoutMs, killSignal: "SIGKILL" })
    } catch {
      console.warn("[rtk] RTK with OpenCode hook support is unavailable; shell commands will run unchanged")
      return
    }

    await ctx.tool.hook("execute.before", async (event) => {
      if (!isShellTool(event.tool) || process.env.RTK_DISABLED === "1") return
      const args = getCommandArgs(event.input)
      if (!args || typeof args.command !== "string" || !args.command) return

      try {
        const workdir = await stat(shellWorkingDirectory(args, ctx.location.directory))
        if (!workdir.isDirectory()) return
        const [agent, session] = await Promise.all([
          ctx.agent.get({ agentID: event.agent, location: { directory: ctx.location.directory } }),
          ctx.session.get({ sessionID: event.sessionID }),
        ])
        const rewritten = await rewrite(args.command, [...agent.data.permissions, ...(session.permissions ?? [])])
        if (rewritten) args.command = rewritten
      } catch {
        // Always leave commands OpenCode can run without RTK to native permissions.
        return
      }
    })
  },
})
