import { Plugin } from "@opencode/plugin"
import { Error as ToolError } from "@opencode/plugin/promise/tool"
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

    const pendingAsks = new Set<string>()
    const callKey = (sessionID: string, messageID: string, id: string) =>
      JSON.stringify([sessionID, messageID, id])

    await ctx.permission.hook("evaluate", async (event) => {
      const source = event.source
      if (event.action !== "shell" || source?.type !== "tool" || event.effect === "deny") return
      if (pendingAsks.has(callKey(event.sessionID, source.messageID, source.id))) {
        event.effect = "ask"
        event.message = "RTK requires approval for this command."
      }
    })
    await ctx.tool.hook("execute.after", async (event) => {
      pendingAsks.delete(callKey(event.sessionID, event.messageID, event.id))
    })

    await ctx.tool.hook("execute.before", async (event) => {
      if (!isShellTool(event.tool)) return
      const args = getCommandArgs(event.input)
      if (!args || typeof args.command !== "string" || !args.command) return

      try {
        const { stdout } = await execFileAsync("rtk", ["rewrite", args.command], { cwd: ctx.location.directory })
        const rewritten = stdout.trim()
        if (rewritten && rewritten !== args.command) args.command = rewritten
      } catch (error) {
        if ((error as { code?: unknown }).code === 2) {
          throw new ToolError({ message: "RTK denied this command." })
        }
        if ((error as { code?: unknown }).code === 3) {
          // Keep the original target so native deny rules still apply.
          const key = callKey(event.sessionID, event.messageID, event.id)
          // Some interrupted calls never emit execute.after. Never evict a live ask.
          if (!pendingAsks.has(key) && pendingAsks.size >= 1024) {
            throw new ToolError({ message: "Too many pending approvals; restart OpenCode before retrying." })
          }
          pendingAsks.add(key)
        }
        // Unavailable rewrites leave the original command to native permissions.
        return
      }
    })
    return () => { pendingAsks.clear() }
  },
})
