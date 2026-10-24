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

for (const [node, npm, needsNode, needsNpm] of [
  ["20.19.0", "10.9.9", true, false],
  ["22.21.9", "10.9.9", true, false],
  ["22.22.0", "11.0.0", false, true],
  ["24.0.0", "11.0.0", true, true],
  ["22.22.0", "", false, false],
  ["24.0.0", "", true, false],
]) {
  test(`failure guidance for Node ${node} and npm ${npm === "" ? "unknown" : npm} is conditional`, () => {
    const result = verify(node, npm);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /npm run verify:toolchain/);
    if (needsNode) {
      assert.match(result.stderr, /For nvm users:\n {2}nvm install 22\n {2}nvm use 22/);
    } else {
      assert.doesNotMatch(result.stderr, /nvm/);
    }
    if (needsNpm) {
      assert.match(result.stderr, /npm install --global npm@10\.9\.9\n {2}npm run verify:toolchain/);
      if (needsNode) {
        assert.match(result.stderr, /If npm still does not satisfy >=10 <11 after selecting Node\.js/);
        assert.ok(result.stderr.indexOf("npm run verify:toolchain") < result.stderr.indexOf("npm install --global"));
      }
    } else {
      assert.doesNotMatch(result.stderr, /npm install/);
    }
    if (!npm) {
      assert.match(result.stderr, /npm version is unknown because npm's user-agent was not provided/);
      assert.doesNotMatch(result.stderr, /npm (?:is )?missing|npm (?:is )?not installed/);
    }
    assert.doesNotMatch(result.stderr, /sudo/);
  });
}

test("compatible versions keep success output free of repair guidance", () => {
  const result = verify("22.22.0", "10.9.9");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "Toolchain OK { node: '22.22.0', npm: '10.9.9' }\n");
  assert.equal(result.stderr, "");
});
