import type { Hooks, PluginInput } from "@opencode-ai/plugin"

function getCommandArgs(args: unknown): Record<string, unknown> | null {
  if (!args || typeof args !== "object") return null
  return args as Record<string, unknown>
}

function isShellTool(tool: unknown): boolean {
  const normalizedTool = String(tool ?? "").toLowerCase()
  return normalizedTool === "bash" || normalizedTool === "shell"
}

// RTK OpenCode plugin — rewrites commands to use rtk for token savings.
// Requires: rtk >= 0.23.0 in PATH.
//
// This is a thin delegating plugin: all rewrite logic lives in `rtk rewrite`,
// which is the single source of truth (src/discover/registry.rs).
// To add or change rewrite rules, edit the Rust registry — not this file.

export async function Rtk({ $ }: PluginInput): Promise<Hooks> {
  try {
    await $`which rtk`.quiet()
  } catch {
    console.warn("[rtk] rtk binary not found in PATH — plugin disabled")
    return {}
  }

  return {
    "tool.execute.before": async (input, output) => {
      if (!isShellTool(input?.tool)) return
      const args = getCommandArgs(output?.args)
      if (!args) return

      const command = args.command
      if (typeof command !== "string" || !command) return

      try {
        const result = await $`rtk rewrite ${command}`.quiet().nothrow()
        const rewritten = String(result.stdout).trim()
        if (rewritten && rewritten !== command) {
          args.command = rewritten
        }
      } catch {
        return
      }
    },
  }
}
