import { lstat, mkdir, readFile, realpath, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const requiredSkills = ["frontend-a11y", "codescene-mcp"];
const dependencies = ["modern-web-guidance"];
const repository = fileURLToPath(new URL("../", import.meta.url));

function options(args) {
  const result = { home: homedir(), dryRun: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--dry-run") result.dryRun = true;
    else if (arg === "--home") {
      result.home = path.resolve(homeArgument(args[++index]));
    } else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  return result;
}

function homeArgument(value) {
  if (!value || value.startsWith("--")) throw new Error("--home requires a directory");
  return value;
}

async function optional(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  }
}

async function planSkill(home, name) {
  const source = await realpath(path.join(repository, "skills", name));
  await readFile(path.join(source, "SKILL.md"), "utf8");
  const destination = path.join(home, ".agents", "skills", name);
  const existing = await optional(() => lstat(destination));
  if (!existing) return { source, destination, exists: false };
  if (existing.isSymbolicLink()) {
    const target = await optional(() => realpath(destination));
    if (target === source) return { source, destination, exists: true };
  }
  throw new Error(`Conflict preserved: ${destination}. Review it manually; no links were installed.`);
}

async function main() {
  const { home, dryRun } = options(process.argv.slice(2));
  // Check every destination before creating anything; never replace user files.
  const plan = await Promise.all([...requiredSkills, ...dependencies].map(name => planSkill(home, name)));
  for (const item of plan) {
    if (!item.exists && !dryRun) {
      await mkdir(path.dirname(item.destination), { recursive: true });
      await symlink(item.source, item.destination, "dir");
    }
    const action = item.exists ? "Already linked" : dryRun ? "Would link" : "Linked";
    process.stdout.write(`${action}: ${item.destination} -> ${item.source}\n`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
