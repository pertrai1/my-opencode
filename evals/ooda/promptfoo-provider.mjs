import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { evaluate } from "./harness.mjs";
import { createPolicy } from "./provider.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const hash = value => createHash("sha256").update(value).digest("hex");

export default class OodaProvider {
  constructor(options = {}, dependencies = {}) {
    this.config = options.config ?? {};
    this.transport = dependencies.transport;
  }

  id() { return "ooda-local-model"; }

  async callApi(prompt, context) {
    let policy;
    const metadata = { kind: "local-model-simulated-tools", promptSha256: hash(prompt) };
    try {
      const model = this.config.model || process.env.OODA_MODEL;
      if (!model) throw new Error("Set OODA_MODEL to an already-installed local tool-calling model");
      metadata.model = model;
      metadata.endpoint = this.config.endpoint ?? "http://127.0.0.1:11434/v1/chat/completions";
      metadata.commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
      metadata.dirty = execFileSync("git", ["status", "--porcelain"], { cwd: repository, encoding: "utf8" }).trim() !== "";
      metadata.sourceHashes = Object.fromEntries(["promptfoo-provider.mjs", "provider.mjs", "tools.mjs", "harness.mjs", "assertion.mjs", "prompt.mjs", "promptfooconfig.mjs"].map(name => [name, hash(readFileSync(new URL(name, import.meta.url)))]));
      policy = createPolicy({ endpoint: metadata.endpoint, model, agent: prompt, transport: this.transport });
      const result = await evaluate(context.vars.scenario, policy);
      return { output: { id: result.id, trace: result.trace, responses: policy.responses }, metadata };
    } catch (error) {
      return { error: error.message, metadata: { ...metadata, trace: policy?.trace, responses: policy?.responses } };
    }
  }
}
