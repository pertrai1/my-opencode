import { Plugin } from "@opencode/plugin"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

function getCommandText(args: unknown): string {
  if (!args || typeof args !== "object") return ""
  const record = args as Record<string, unknown>
  if (typeof record.command === "string") return record.command
  if (typeof record.cmd === "string") return record.cmd
  return typeof record.content === "string" ? record.content : ""
}

export default Plugin.define({
  id: "code-review-graph",
  async setup(ctx) {
    await ctx.tool.hook("execute.before", async (event) => {
      if (!/^git\s+commit/i.test(getCommandText(event.input))) return
      try {
        const { stdout } = await execFileAsync("code-review-graph", ["detect-changes", "--brief"])
        const text = stdout.trim()
        if (text) console.log("[code-review-graph] pre-commit analysis", { output: text })
      } catch {
        // The graph CLI is optional and must not block commits.
        return
      }
    })

    await ctx.tool.hook("execute.after", async (event) => {
      if (event.status !== "completed" || !["edit", "write", "patch"].includes(event.tool)) return
      try {
        await execFileAsync("code-review-graph", ["update", "--skip-flows"])
      } catch {
        // The graph CLI is optional and must not block edits.
        return
      }
    })
  },
})
