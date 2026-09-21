import { Plugin } from "@opencode/plugin"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

function getCommandArgs(args: unknown): Record<string, unknown> | null {
  if (!args || typeof args !== "object") return null
  return args as Record<string, unknown>
}

function isShellTool(tool: unknown): boolean {
  const normalizedTool = String(tool ?? "").toLowerCase()
  return normalizedTool === "bash" || normalizedTool === "shell"
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
        const { stdout } = await execFileAsync("rtk", ["rewrite", args.command])
        const rewritten = stdout.trim()
        if (rewritten && rewritten !== args.command) args.command = rewritten
      } catch {
        // A failed rewrite must not prevent the original command from running.
        return
      }
    })
  },
})
