import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin"
import type { Event } from "@opencode-ai/sdk"

function getCommandText(args: unknown): string {
  if (!args || typeof args !== "object") return ""
  const record = args as Record<string, unknown>
  if (typeof record.command === "string") return record.command
  if (typeof record.cmd === "string") return record.cmd
  return typeof record.content === "string" ? record.content : ""
}

/**
 * code-review-graph plugin for OpenCode.
 *
 * Keeps the knowledge graph up-to-date during coding sessions.
 *
 * Installed by: code-review-graph install --platform opencode
 */
export const CrgPlugin: Plugin = async ({ $ }: PluginInput): Promise<Hooks> => {
  return {
    // Auto-update graph after file edits.
    event: async ({ event }: { event: Event }) => {
      if (event.type === "file.edited") {
        try {
          await $`code-review-graph update --skip-flows`.quiet()
        } catch {
          return
        }
      }
    },

    // Detect changes before git commit commands.
    "tool.execute.before": async (input, output) => {
      try {
        const cmd = getCommandText(output.args)
        if (typeof cmd === "string" && /^git\s+commit/i.test(cmd)) {
          const result = await $`code-review-graph detect-changes --brief`.quiet()
          const text = result.stdout?.toString().trim()
          if (text) {
            console.log("[code-review-graph] pre-commit analysis", { output: text })
          }
        }
      } catch {
        return
      }
    },
  }
}

export default CrgPlugin
