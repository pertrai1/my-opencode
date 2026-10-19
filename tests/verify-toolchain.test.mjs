import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repository = fileURLToPath(new URL("../", import.meta.url));

function verify(node, npm = "10.9.9") {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", `
    Object.defineProperty(process.versions, "node", { value: ${JSON.stringify(node)} });
    await import("./scripts/verify-toolchain.mjs");
  `], {
    cwd: repository,
    encoding: "utf8",
    env: { ...process.env, npm_config_user_agent: npm ? `npm/${npm} node/v${node}` : "" },
  });
}

for (const [node, expected] of [
  ["22.21.9", 1],
  ["22.22.0", 0],
  ["22.22.1", 0],
  ["22.23.3", 0],
  ["23.0.0", 1],
  ["21.99.99", 1],
  ["22.22.0-rc.1", 1],
]) {
  test(`toolchain verifier ${expected ? "rejects" : "accepts"} reported Node ${node}`, () => {
    const result = verify(node);
    assert.equal(result.status, expected, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, expected ? /node .* does not satisfy >=22\.22\.0 <23/ : /Toolchain OK/);
  });
}

for (const npm of ["9.9.9", "11.0.0", "10.9.9-beta.1", undefined]) {
  test(`toolchain verifier rejects reported npm ${npm ?? "unknown"}`, () => {
    const result = verify("22.22.0", npm ?? "");
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /npm .* does not satisfy >=10 <11/);
  });
}
