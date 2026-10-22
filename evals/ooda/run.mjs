import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { evaluate, scenarios } from "./harness.mjs";
import { createPolicy, localEndpoint } from "./provider.mjs";

const { values } = parseArgs({ options: {
  model: { type: "string" }, endpoint: { type: "string", default: "http://127.0.0.1:11434/v1/chat/completions" },
  agent: { type: "string", default: "agents/sdlc-orchestrator.md" }, output: { type: "string", default: ".promptfoo/ooda-local.json" },
} });
if (!values.model) throw new Error("Supply --model with an already installed local tool-calling model; no models are downloaded.");
localEndpoint(values.endpoint);
const source = readFileSync(values.agent, "utf8");
const agent = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
const hash = value => createHash("sha256").update(value).digest("hex");
const results = [];
for (const id of Object.keys(scenarios)) {
  const policy = createPolicy({ endpoint: values.endpoint, model: values.model, agent });
  try { results.push({ ...await evaluate(id, policy), responses: policy.responses }); }
  catch (error) { results.push({ id, pass: null, infrastructureError: error.message, trace: policy.trace, responses: policy.responses }); }
}
const report = {
  kind: "local-model-simulated-tools", timestamp: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  dirty: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() !== "",
  model: values.model, endpoint: values.endpoint, agentPath: values.agent, agentSha256: hash(source),
  harnessSha256: hash(readFileSync(new URL("./harness.mjs", import.meta.url))),
  results,
};
mkdirSync(new URL("../../.promptfoo/", import.meta.url), { recursive: true });
writeFileSync(values.output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(JSON.stringify({ output: values.output, passed: results.filter(result => result.pass).length, failed: results.filter(result => !result.pass && result.pass !== null).length, infrastructureErrors: results.filter(result => result.pass === null).length }) + "\n");
process.exitCode = results.some(result => result.pass === null) ? 2 : results.every(result => result.pass) ? 0 : 1;
