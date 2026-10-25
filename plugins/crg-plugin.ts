import { Plugin } from "@opencode/plugin"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { isShellTool, splitChainedCommands, withoutComments, withoutRtkPrefix } from "../lib/shell-command.ts"

const execFileAsync = promisify(execFile)
const graphTimeoutMs = 10_000
const directoryChange = /^[({\s]*(?:cd|pushd|popd)(?:\s|$)/i
const gitCommit = /^git\s+commit(?:\s|$)/i

type GraphStatus = {
  files?: unknown
  built_at_commit?: unknown
  current_sha?: unknown
  built_on_branch?: unknown
  current_branch?: unknown
}

function statusFieldsMatch(status: GraphStatus, builtKey: "built_at_commit" | "built_on_branch", currentKey: "current_sha" | "current_branch"): boolean {
  const built = status[builtKey]
  const current = status[currentKey]
  return typeof built === "string" && typeof current === "string" && built === current
}

function graphNeedsBuild(stdout: string): boolean {
  let status: GraphStatus
  try {
    status = JSON.parse(stdout) as GraphStatus
  } catch {
    return true
  }

  if (typeof status.files !== "number" || status.files <= 0) return true
  return !statusFieldsMatch(status, "built_at_commit", "current_sha") ||
    !statusFieldsMatch(status, "built_on_branch", "current_branch")
}

function getCommandText(args: unknown): string {
  if (!args || typeof args !== "object") return ""
  const record = args as Record<string, unknown>
  if (typeof record.command === "string") return record.command
  return typeof record.cmd === "string" ? record.cmd : ""
}

// The graph CLI analyzes the session directory, so a commit after a directory change is skipped.
function isSessionDirectoryCommit(command: string): boolean {
  for (const part of splitChainedCommands(withoutComments(command)).map(withoutRtkPrefix)) {
    if (directoryChange.test(part)) return false
    if (gitCommit.test(part)) return true
  }
  return false
}

async function ensureCurrentGraph(directory: string): Promise<void> {
  let statusOutput: string | undefined
  try {
    const { stdout } = await execFileAsync("code-review-graph", ["status", "--json"], {
      cwd: directory,
      timeout: graphTimeoutMs,
      killSignal: "SIGKILL",
    })
    statusOutput = stdout
  } catch {
    // A missing graph is handled by the full build below. The CLI is optional.
    statusOutput = undefined
  }
  if (statusOutput !== undefined && !graphNeedsBuild(statusOutput)) return

  try {
    await execFileAsync("code-review-graph", ["build"], {
      cwd: directory,
      timeout: graphTimeoutMs,
      killSignal: "SIGKILL",
    })
  } catch {
    // Graph maintenance must not block a session, including outside git repos.
    return
  }
}

export default Plugin.define({
  id: "code-review-graph",
  async setup(ctx) {
    await ensureCurrentGraph(ctx.location.directory)

    await ctx.tool.hook("execute.before", async (event) => {
      if (!isShellTool(event.tool) || !isSessionDirectoryCommit(getCommandText(event.input))) return
      try {
        const { stdout } = await execFileAsync("code-review-graph", ["detect-changes", "--brief"], {
          cwd: ctx.location.directory,
          timeout: graphTimeoutMs,
          killSignal: "SIGKILL", // Bound the wait even if the optional CLI ignores SIGTERM.
        })
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
        await execFileAsync("code-review-graph", ["update", "--skip-flows"], {
          cwd: ctx.location.directory,
          timeout: graphTimeoutMs,
          killSignal: "SIGKILL",
        })
      } catch {
        // The graph CLI is optional and must not block edits.
        return
      }
    })
  },
})
