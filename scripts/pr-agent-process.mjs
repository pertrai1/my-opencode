import { spawnSync } from "node:child_process";

// CLI-owned subprocess boundary; never interpolate prompts, paths or comments into a shell.
export function runProcess(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8", shell: false, timeout: 60_000, killSignal: "SIGKILL",
    maxBuffer: 16 * 1024 * 1024, ...options,
  });
}

export function checkedOutput(command, args, { execute = runProcess, statuses = [0], ...options } = {}) {
  const result = execute(command, args, options);
  if (result.error || !statuses.includes(result.status)) {
    // Child diagnostics can contain credentials or diff content. Do not echo them.
    throw new Error(`${command} failed (${result.error?.code ?? result.signal ?? result.status ?? "unknown"}).`);
  }
  return result.stdout ?? "";
}

export function processSucceeded(result) {
  return !result.error && result.status === 0;
}
