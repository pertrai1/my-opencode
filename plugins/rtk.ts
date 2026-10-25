import { Plugin } from "@opencode/plugin"
import { Error as ToolError } from "@opencode/plugin/promise/tool"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { isShellTool } from "../lib/shell-command.ts"

const execFileAsync = promisify(execFile)
const rewriteTimeoutMs = 10_000

function getCommandArgs(args: unknown): Record<string, unknown> | null {
  if (!args || typeof args !== "object") return null
  return args as Record<string, unknown>
}

export default Plugin.define({
  id: "rtk",
  async setup(ctx) {
    try {
      await execFileAsync("which", ["rtk"])
    } catch {
      console.warn("[rtk] rtk binary not found in PATH — plugin disabled")
      return
    }

    await ctx.tool.hook("execute.before", async (event) => {
      if (!isShellTool(event.tool)) return
      const args = getCommandArgs(event.input)
      if (!args || typeof args.command !== "string" || !args.command) return

      try {
        const { stdout } = await execFileAsync("rtk", ["rewrite", args.command], {
          cwd: ctx.location.directory,
          timeout: rewriteTimeoutMs,
          killSignal: "SIGKILL", // Release the hook even if RTK ignores SIGTERM.
        })
        const rewritten = stdout.trim()
        if (rewritten && rewritten !== args.command) args.command = rewritten
      } catch (error) {
        if ((error as { code?: unknown }).code === 2) {
          throw new ToolError({ message: "RTK denied this command." })
        }
        // RTK asks leave the original command to OpenCode's native permissions.
        // In particular, RTK must not require approval for otherwise-allowed commands.
        return
      }
    })
  },
})
