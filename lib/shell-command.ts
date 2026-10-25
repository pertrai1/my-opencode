// Shell tool IDs across OpenCode V1 (`bash`) and V2 (`shell`).
const SHELL_TOOL_NAMES = new Set(["bash", "shell"]);

export function isShellTool(tool: unknown): boolean {
  return SHELL_TOOL_NAMES.has(String(tool ?? "").toLowerCase());
}

// The RTK plugin rewrites commands to `rtk <command>`; inspect the wrapped command instead.
export function withoutRtkPrefix(command: string): string {
  return command.replace(/^rtk(?:\s+|$)/i, "");
}

const DOUBLE_SEPARATORS = new Set(["&&", "||"]);
const SINGLE_SEPARATORS = new Set([";", "\n", "\r", "&", "|"]);

// Length of the unquoted command separator starting at `index`, or 0 when there is none.
function separatorLength(command: string, index: number): number {
  if (DOUBLE_SEPARATORS.has(command.slice(index, index + 2))) return 2;
  return SINGLE_SEPARATORS.has(command[index]) ? 1 : 0;
}

// The open quote after reading `char`; a quote inside the other kind of quote is literal.
function nextQuote(quote: string | null, char: string): string | null {
  if (char !== "'" && char !== '"') return quote;
  if (quote === null) return char;
  return quote === char ? null : quote;
}

// Characters after which an unquoted `#` starts a shell comment.
const WORD_BOUNDARIES = new Set([" ", "\t", "\n", "\r", ";", "&", "|", "(", ")", "<", ">"]);

function lineEnd(command: string, index: number): number {
  const newline = command.indexOf("\n", index);
  return newline === -1 ? command.length : newline;
}

// Removes `#` comments, which run from an unquoted word start to the end of the line.
export function withoutComments(command: string): string {
  let result = "";
  let quote: string | null = null;
  let escaped = false;
  let atWordStart = true;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (atWordStart && char === "#") {
      i = lineEnd(command, i) - 1;
      atWordStart = false;
      continue;
    }

    result += char;
    if (escaped || char === "\\") {
      escaped = !escaped;
      atWordStart = false;
      continue;
    }

    quote = nextQuote(quote, char);
    atWordStart = quote === null && WORD_BOUNDARIES.has(char);
  }

  return result;
}

// Comment text is kept so that policy checks also inspect it and fail closed.
export function splitChainedCommands(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }

    quote = nextQuote(quote, char);
    const separator = quote === null ? separatorLength(command, i) : 0;
    if (separator > 0) {
      parts.push(current);
      current = "";
      i += separator - 1;
      continue;
    }

    current += char;
  }

  if (current) {
    parts.push(current);
  }

  return parts.map((part) => part.trim()).filter(Boolean);
}
