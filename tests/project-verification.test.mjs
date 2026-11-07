import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import yaml from "js-yaml";

const repository = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(join(repository, path), "utf8");
const protocol = "~/.config/opencode/docs/agents/verification-evidence.md";

test("verification evidence is globally loaded independently of target AGENTS.md", () => {
  const { config, error } = ts.parseConfigFileTextToJson("opencode.jsonc", read("opencode.jsonc"));
  assert.equal(error, undefined);
  assert.ok(config.instructions.includes(protocol));
  assert.equal(config.instructions.filter(path => path === protocol).length, 1);
  assert.ok(read("docs/agents/verification-evidence.md").trim().length > 0);
});

for (const path of [
  "agents/sdlc-orchestrator.md",
  "agents/tdd-orchestrator.md",
  "agents/change-verifier.md",
  "agents/implementer.md",
  "agents/test-reviewer.md",
  "commands/verify.md",
  ".agents/docs/verification/README.md",
]) {
  test(`${path} points to the shared verification evidence protocol`, () => {
    assert.ok(read(path).includes("verification-evidence.md"), `${path} must reference the shared protocol`);
  });
}

test("verify reads its installed rubric without requiring a target-project copy", () => {
  assert.ok(read("commands/verify.md").includes("~/.config/opencode/.agents/docs/verification/README.md"));
  assert.ok(read(".agents/docs/verification/README.md").includes("### Section 7: Clear Disposition"));
});

test("verification guidance does not grant restricted reviewers shell execution", () => {
  for (const name of ["change-verifier", "test-reviewer"]) {
    const definition = yaml.load(read(`agents/${name}.md`).split("---")[1]);
    const shell = definition.permissions.filter(rule => rule.action === "shell");
    assert.deepEqual(shell, [{ action: "shell", resource: "*", effect: "deny" }]);
  }
});

function materialize(t, language, directory = tmpdir()) {
  const target = realpathSync(mkdtempSync(join(directory, `verification-${language}-`)));
  t.after(() => rmSync(target, { recursive: true, force: true }));
  const source = join(repository, "evals/project-verification", language);
  for (const file of readdirSync(source)) {
    assert.ok(file.endsWith(".fixture"));
    writeFileSync(join(target, file.replace(/\.fixture$/, "")), readFileSync(join(source, file)));
  }
  assert.notEqual(target, repository);
  return target;
}

function run(command, args, cwd) {
  const env = { ...process.env };
  // A fresh Node test runner must not inherit the parent runner context.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout: 10_000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, result.stderr);
  return { exit: result.status, output: result.stdout + result.stderr };
}

test("materialized target matches child cwd through a symlinked temporary parent", t => {
  const directory = mkdtempSync(join(tmpdir(), "verification-symlink-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const alias = join(directory, "alias");
  symlinkSync(directory, alias, process.platform === "win32" ? "junction" : "dir");
  const target = materialize(t, "node", alias);
  const result = run(process.execPath, ["--eval", 'console.log(`cwd: ${process.cwd()}`)'], target);
  assert.equal(result.exit, 0, result.output);
  const actualCwd = result.output.match(/^cwd: (.+)$/m)?.[1];
  assert.equal(actualCwd, target, "fixture identity must match the actual subprocess working directory");
});

// These are executed fixture checks, not agent runs or a semantic report grader.
for (const scenario of [
  {
    language: "node", command: process.execPath, args: ["--test", "shipping.test.mjs"],
    manifest: "package.json", source: "shipping.mjs", broken: "return subtotal;",
    fixed: "return subtotal + shipping;", failure: /shipping is included/, success: /# fail 0/,
  },
  {
    language: "python", command: "python3", args: ["-m", "unittest", "-v"],
    manifest: "pyproject.toml", source: "shipping.py", broken: "return subtotal",
    fixed: "return subtotal + shipping", failure: /FAIL: test_shipping_is_included/, success: /\bOK\b/,
  },
]) {
  test(`${scenario.language} fixture records target-cwd failure then a real passing rerun`, t => {
    if (scenario.language === "python") {
      const availability = spawnSync("python3", ["--version"], { encoding: "utf8" });
      if (availability.error?.code === "ENOENT") {
        t.skip("Python fixture not run: python3 is unavailable; no Python behavior verified");
        return;
      }
      assert.equal(availability.status, 0, availability.stderr);
    }
    const target = materialize(t, scenario.language);
    assert.ok(existsSync(join(target, scenario.manifest)));
    if (scenario.language === "python") assert.equal(existsSync(join(target, "package.json")), false);
    const failed = run(scenario.command, scenario.args, target);
    assert.equal(failed.exit, 1, failed.output);
    assert.match(failed.output, scenario.failure);
    assert.ok(failed.output.includes(`target cwd: ${target}`), failed.output);
    assert.match(failed.output, /rejects_negative|rejects negative/);
    // Repair only the isolated fixture, then capture a fresh process result.
    const path = join(target, scenario.source);
    const source = readFileSync(path, "utf8");
    assert.ok(source.includes(scenario.broken));
    writeFileSync(path, source.replace(scenario.broken, scenario.fixed));
    const passed = run(scenario.command, scenario.args, target);
    assert.equal(passed.exit, 0, passed.output);
    assert.match(passed.output, scenario.success);
    assert.ok(passed.output.includes(`target cwd: ${target}`), passed.output);
    t.diagnostic(JSON.stringify({
      target, revision: "unversioned temporary fixture", scope: scenario.source,
      command: [scenario.command, ...scenario.args],
      before: failed, after: passed,
    }));
  });
}
