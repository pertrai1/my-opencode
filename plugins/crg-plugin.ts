type ShellCommandResult = {
  stdout?: {
    toString(): string
  }
}

type ShellCommand = {
  quiet(): Promise<ShellCommandResult>
}

type ShellTemplate = (
  strings: TemplateStringsArray,
  ...values: ReadonlyArray<unknown>
) => ShellCommand

type ToolExecuteInput = {
  command?: unknown
  cmd?: unknown
  content?: unknown
}

type PluginEventContext = {
  $: ShellTemplate
  input?: ToolExecuteInput
  params?: ToolExecuteInput
}

type CodeReviewGraphApp = {
  on(eventName: string, handler: (context: PluginEventContext) => Promise<void>): void
}

function getCommandText(input: ToolExecuteInput | undefined): string {
  if (!input) return ""
  if (typeof input.command === "string") return input.command
  if (typeof input.cmd === "string") return input.cmd
  return typeof input.content === "string" ? input.content : ""
}

/**
 * code-review-graph plugin for OpenCode.
 *
 * Keeps the knowledge graph up-to-date and surfaces status
 * information automatically during coding sessions.
 *
 * Installed by: code-review-graph install --platform opencode
 */

export default function CrgPlugin(app: CodeReviewGraphApp): void {
  // 1. Auto-update graph after file edits
  app.on("file.edited", async ({ $ }) => {
    try {
      await $`code-review-graph update --skip-flows`.quiet()
    } catch {
      return
    }
  })

  // 2. Show graph status when a new session starts
  app.on("session.created", async ({ $ }) => {
    try {
      const result = await $`code-review-graph status`.quiet()
      const output = result.stdout?.toString().trim()
      if (output) {
        console.log("[code-review-graph] status", { output })
      }
    } catch {
      return
    }
  })

  // 3. Detect changes before git commit commands
  app.on("tool.execute.before", async (context) => {
    try {
      const input = context.input ?? context.params
      const cmd = getCommandText(input)
      if (typeof cmd === "string" && /^git\s+commit/i.test(cmd)) {
        const result =
          await context.$`code-review-graph detect-changes --brief`.quiet()
        const output = result.stdout?.toString().trim()
        if (output) {
          console.log("[code-review-graph] pre-commit analysis", { output })
        }
      }
    } catch {
      return
    }
  })
}
