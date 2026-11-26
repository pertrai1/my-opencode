import { Plugin } from "@opencode/plugin"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { isShellTool, splitChainedCommands, withoutComments, withoutRtkPrefix } from "../lib/shell-command.ts"
import { shellWorkingDirectory } from "../lib/shell-workdir.ts"

const execFileAsync = promisify(execFile)
const graphTimeoutMs = 10_000
const directoryChange = /^[({\s]*(?:cd|pushd|popd)(?:\s|$)/i
const gitCommit = /^git\s+commit(?:\s|$)/i
const graphEditTools = new Set(["edit", "write", "patch"])

function graphCommand(args: string[], cwd: string) {
  return execFileAsync("code-review-graph", args, { cwd, timeout: graphTimeoutMs, killSignal: "SIGKILL" })
}

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

  if (typeof status?.files !== "number" || status.files <= 0) return true
  return !statusFieldsMatch(status, "built_at_commit", "current_sha") ||
    !statusFieldsMatch(status, "built_on_branch", "current_branch")
}

function getCommandText(args: unknown): string {
  if (!args || typeof args !== "object") return ""
  const record = args as Record<string, unknown>
  if (typeof record.command === "string") return record.command
  return typeof record.cmd === "string" ? record.cmd : ""
}

// A commit after an inline directory change may target a different repository.
function isDirectCommit(command: string): boolean {
  for (const part of splitChainedCommands(withoutComments(command)).map(withoutRtkPrefix)) {
    if (directoryChange.test(part)) return false
    if (gitCommit.test(part)) return true
  }
  return false
}

async function gitRoot(directory: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      cwd: directory,
      timeout: graphTimeoutMs,
      killSignal: "SIGKILL",
    })
    return stdout.replace(/\r?\n$/, "") || undefined
  } catch {
    return undefined
  }
}

async function buildGraphIfNeeded(directory: string): Promise<boolean> {
  let statusOutput: string | undefined
  try {
    const { stdout } = await graphCommand(["status", "--json"], directory)
    statusOutput = stdout
  } catch {
    // A missing graph is handled by the full build below. The CLI is optional.
    statusOutput = undefined
  }
  if (statusOutput !== undefined && !graphNeedsBuild(statusOutput)) return false

  try {
    await graphCommand(["build"], directory)
    return true
  } catch {
    // An unavailable graph CLI must not block a session.
    return false
  }
}

export default Plugin.define({
  id: "code-review-graph",
  async setup(ctx) {
    let root = await gitRoot(ctx.location.directory)
    if (root) await buildGraphIfNeeded(root)
    let initializing: Promise<boolean> | undefined

    await ctx.tool.hook("execute.before", async (event) => {
      if (!isShellTool(event.tool) || !isDirectCommit(getCommandText(event.input))) return
      const directory = await gitRoot(shellWorkingDirectory(event.input, ctx.location.directory))
      if (!directory) return
      try {
        const { stdout } = await graphCommand(["detect-changes", "--brief"], directory)
        const text = stdout.trim()
        if (text) console.log("[code-review-graph] pre-commit analysis", { output: text })
      } catch {
        // The graph CLI is optional and must not block commits.
        return
      }
    })

    await ctx.tool.hook("execute.after", async (event) => {
      if (event.status !== "completed" || !graphEditTools.has(event.tool)) return
      const directory = root ?? await gitRoot(ctx.location.directory)
      if (!directory) return
      if (initializing) {
        await initializing
      } else if (!root) {
        root = directory
        initializing = buildGraphIfNeeded(root)
        const rebuilt = await initializing
        initializing = undefined
        if (rebuilt) return
      }
      try {
        await graphCommand(["update", "--skip-flows"], directory)
      } catch {
        // The graph CLI is optional and must not block edits.
        return
      }
    })
  },
})
