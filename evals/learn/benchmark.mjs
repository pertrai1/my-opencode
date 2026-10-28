import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import prompt from "./prompt.js";

const learn = yaml.load(readFileSync(new URL("./promptfooconfig.yaml", import.meta.url), "utf8"));
const repository = fileURLToPath(new URL("../../", import.meta.url));

export function createBenchmark({ root = repository, env = process.env } = {}) {
  const required = name => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} must be explicitly configured and nonblank`);
    return value;
  };
  const provider = required("LEARN_BENCHMARK_PROVIDER");
  if (!/^openai:chat:[^\s#:]+$/.test(provider)) {
    throw new Error("LEARN_BENCHMARK_PROVIDER must be openai:chat:<verified API model ID>, without OpenCode's # suffix");
  }
  const effort = required("LEARN_BENCHMARK_REASONING_EFFORT");
  if (!["low", "medium", "high", "xhigh", "max"].includes(effort)) {
    throw new Error("LEARN_BENCHMARK_REASONING_EFFORT must be low, medium, high, xhigh or max, supported by the selected model");
  }
  const ref = env.LEARN_BASELINE_REF === undefined ? "origin/main" : required("LEARN_BASELINE_REF");
  const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  let revision;
  let baseline;
  try {
    revision = git(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]).trim();
    baseline = git(["show", `${revision}:commands/learn.md`]);
  } catch (error) {
    throw new Error(`Cannot read commands/learn.md at baseline ref ${ref}; fetch origin main or choose a valid commit`, { cause: error });
  }
  const candidate = readFileSync(join(root, "commands/learn.md"), "utf8");
  const hash = createHash("sha256").update(candidate).digest("hex");
  const snapshot = (label, command) => {
    prompt.fromCommand(command, { vars: {} }); // Fail before model calls on invalid instructions.
    return { label, raw: command, function: context => prompt.fromCommand(command, context) };
  };
  const [originalProvider] = learn.providers;
  return {
    ...learn,
    description: `Learn prompt benchmark: baseline ${revision}; working copy sha256 ${hash}`,
    prompts: [snapshot(`baseline ${revision.slice(0, 12)}`, baseline), snapshot(`working copy ${hash.slice(0, 12)}`, candidate)],
    providers: [{ ...originalProvider, id: provider, config: { ...originalProvider.config, reasoning_effort: effort } }],
  };
}

export default createBenchmark();
