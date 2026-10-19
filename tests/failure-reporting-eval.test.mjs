import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import loadEvidence from "../context.js";
import createPrompt from "../evals/failure-reporting/prompt.js";

test("failure-reporting prompt uses the verifier body and supplied evidence", () => {
  const evidence = loadEvidence().output;
  const messages = createPrompt({ vars: { evidence } });
  const agent = readFileSync(new URL("../agents/change-verifier.md", import.meta.url), "utf8");
  const bodyStart = agent.indexOf("You are the CHANGE-VERIFIER.");

  assert.ok(bodyStart > 0);
  assert.deepEqual(messages, [
    { role: "system", content: agent.slice(bodyStart).trim() },
    { role: "user", content: evidence },
  ]);
  assert.match(evidence, /SYNTHETIC FIXTURE/);
  assert.match(evidence, /No fix or successful rerun is recorded/);
});

test("offline calibration rejects socket and fetch connections", () => {
  const guard = fileURLToPath(new URL("../evals/failure-reporting/offline.js", import.meta.url));
  const result = spawnSync(process.execPath, ["--require", guard, "--input-type=module", "--eval", `
    import assert from "node:assert/strict";
    import net from "node:net";
    assert.throws(() => net.createConnection({ port: 1, host: "127.0.0.1" }), /disabled for offline calibration/);
    await assert.rejects(fetch("data:text/plain,hello"), /disabled for offline calibration/);
  `], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
