import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import yaml from "js-yaml";

const repository = fileURLToPath(new URL("../", import.meta.url));
const installer = path.join(repository, "scripts/install-required-skills.mjs");
const names = ["frontend-a11y", "codescene-mcp", "modern-web-guidance"];

function fixture(t) {
  const home = mkdtempSync(path.join(tmpdir(), "required-skills-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

test("dry run leaves a clean home untouched; install and rerun use the maintained sources", t => {
  const home = fixture(t);
  const run = (...args) => execFileSync(process.execPath, [installer, "--home", home, ...args], { encoding: "utf8" });
  assert.match(run("--dry-run"), /Would link/);
  assert.equal(existsSync(path.join(home, ".agents")), false);
  run();
  for (const name of names) {
    const link = path.join(home, ".agents/skills", name);
    assert.equal(realpathSync(link), realpathSync(path.join(repository, "skills", name)));
    assert.equal(readFileSync(path.join(link, "SKILL.md"), "utf8"), readFileSync(path.join(repository, "skills", name, "SKILL.md"), "utf8"));
  }
  assert.equal(run().match(/Already linked/g).length, 3);
  assert.ok(existsSync(path.join(home, ".agents/skills/frontend-a11y/A11Y.md")));
  assert.equal(realpathSync(path.join(home, ".agents/skills/codescene-mcp/references/setup.md")), realpathSync(path.join(repository, "docs/codescene-setup.md")));
});

for (const kind of ["directory", "file", "other-link", "broken-link"]) {
  test(`preserves ${kind} conflict and creates no partial installation`, t => {
    const home = fixture(t);
    const parent = path.join(home, ".agents/skills");
    mkdirSync(parent, { recursive: true });
    const conflict = path.join(parent, "codescene-mcp");
    if (kind === "directory") mkdirSync(conflict);
    else if (kind === "file") writeFileSync(conflict, "keep me");
    else symlinkSync(kind === "other-link" ? home : path.join(home, "missing"), conflict, "dir");
    const result = spawnSync(process.execPath, [installer, "--home", home], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Conflict preserved/);
    assert.equal(existsSync(path.join(parent, "frontend-a11y")), false);
    assert.ok(lstatSync(conflict));
    if (kind === "file") assert.equal(readFileSync(conflict, "utf8"), "keep me");
  });
}

test("a dependency conflict prevents installing either top-level skill", t => {
  const home = fixture(t);
  const parent = path.join(home, ".agents/skills");
  mkdirSync(parent, { recursive: true });
  writeFileSync(path.join(parent, "modern-web-guidance"), "keep dependency");
  const result = spawnSync(process.execPath, [installer, "--home", home], { encoding: "utf8" });
  assert.equal(result.status, 1);
  for (const name of ["frontend-a11y", "codescene-mcp"]) assert.equal(existsSync(path.join(parent, name)), false);
  assert.equal(readFileSync(path.join(parent, "modern-web-guidance"), "utf8"), "keep dependency");
});

test("missing home argument fails without installing anything", () => {
  const result = spawnSync(process.execPath, [installer, "--home"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires a directory/);
});

test("web guidance uses the existing constrained-agent shell allowance", () => {
  const skill = readFileSync(path.join(repository, "skills/modern-web-guidance/SKILL.md"), "utf8");
  const commands = [...skill.replaceAll(/^> ?/gm, "").matchAll(/```sh\n([^`]+)```/g)]
    .map(match => match[1].trim());
  assert.equal(commands.length, 3);
  for (const command of commands) assert.match(command, /^npx -y modern-web-guidance@latest (search|list|retrieve)\b/);
  assert.doesNotMatch(skill, /\bpnpx\b|\bnpx\.cmd\b|npx --offline/);
  for (const agent of ["implementer", "tdd-orchestrator", "sdlc-orchestrator"]) {
    const content = readFileSync(path.join(repository, "agents", `${agent}.md`), "utf8");
    const frontmatter = content.split("---")[1];
    assert.match(frontmatter, /action: "shell"\s+resource: "npx -y modern-web-guidance@latest \*"\s+effect: allow/);
  }
});

test("web guidance research depends on the task without waiving accessibility or browser support", () => {
  const skill = readFileSync(path.join(repository, "skills/modern-web-guidance/SKILL.md"), "utf8");
  const a11y = readFileSync(path.join(repository, "skills/frontend-a11y/SKILL.md"), "utf8");
  const { description } = yaml.load(skill.match(/^---\n([\s\S]*?)\n---/)[1]);
  // The description drives skill selection, so it keeps concrete triggers and the reason
  // within the Agent Skills 1024-character description limit.
  assert.ok(description.length <= 1024, `description is ${description.length} characters`);
  for (const trigger of ["dialogs", "popovers", "View Transitions", "CWV (LCP, INP)", "Forms, autofill"]) {
    assert.ok(description.includes(trigger), `description must keep trigger: ${trigger}`);
  }
  assert.match(description, /change faster than model training data/);
  assert.match(description, /Skip the lookup for a mechanical edit that keeps an inspected existing pattern/);
  // An explicit request for current guidance overrides the mechanical-edit skip.
  assert.match(description, /compatibility question, unless the user asks for current guidance/);
  assert.doesNotMatch(description, /MANDATORY|Execute FIRST for all/);
  // Compare body prose with line wrapping collapsed, so reflowing does not break the contract.
  const prose = skill.replace(/\s+/g, " ");
  for (const phrase of [
    "unfamiliar web API, a new UI pattern, or a performance technique",
    "browser support, progressive enhancement, or fallback behavior",
    "anything the user asks to check against current web guidance",
    "needs no lookup when it introduces no new API or compatibility question and the user has not asked for current guidance",
    "An existing pattern shows local convention, not current best practice",
    "This exception does not waive frontend accessibility checks or the project's browser-support requirements",
    "you **MUST** follow the fallback recommendations",
    "If a needed lookup is unavailable, report that",
  ]) assert.ok(prose.includes(phrase), `skill must keep: ${phrase}`);
  assert.ok(!prose.includes("with a `### Modern Web Guidance` section"), "separate report section must stay removed");
  assert.match(a11y, /mechanical-edit exception does not waive these accessibility checks/);
});
