import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { run } from "../scripts/work-item.mjs";

test("creates a stable, tracker-neutral work item with local artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await run([
    "create",
    "--root",
    root,
    "--request",
    "Add ellipsis behavior to the search input",
    "--type",
    "feature",
    "--risk",
    "low",
    "--route",
    "light-task",
    "--acceptance",
    "Long values are visually truncated",
  ]);

  assert.equal(item.version, 1);
  assert.equal(item.source.kind, "local");
  assert.equal(item.type, "feature");
  assert.equal(item.status, "new");
  assert.deepEqual(item.acceptanceCriteria, ["Long values are visually truncated"]);
  assert.match(item.id, /^wi-\d{8}T\d{6}Z-add-ellipsis-behavior-to-the-search-input-[0-9a-f]{8}$/);
  assert.equal(JSON.parse(await readFile(path.join(root, ".agents/work", item.id, "work.json"), "utf8")).id, item.id);
  assert.match(await readFile(path.join(root, ".agents/work", item.id, "request.md"), "utf8"), /Add ellipsis behavior/);
});

test("supports resuming an existing work item", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const created = await run(["create", "--root", root, "--request", "Investigate a flaky test", "--type", "investigation"]);
  const resumed = await run(["resume", "--root", root, created.id]);
  assert.equal(resumed.id, created.id);
  assert.equal(resumed.nextAction, "Triage the request and select a route.");
});

test("creates distinct IDs for repeated requests with the same timestamp", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const now = new Date("2026-09-25T12:00:00.000Z");
  const first = await run(["create", "--root", root, "--request", "Repeat this request"], now);
  const second = await run(["create", "--root", root, "--request", "Repeat this request"], now);
  assert.notEqual(first.id, second.id);
  assert.deepEqual((await run(["list", "--root", root])).map((item) => item.id).sort(), [first.id, second.id].sort());
});

test("lists local work items and returns an empty list for a new project", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  assert.deepEqual(await run(["list", "--root", root]), []);

  const created = await run(["create", "--root", root, "--request", "List this request"]);
  const listed = await run(["list", "--root", root]);
  assert.deepEqual(listed.map((item) => item.id), [created.id]);
});

test("ignores incomplete staging directories while listing work items", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const stagingDirectory = path.join(root, ".agents", "work", ".wi-in-progress.tmp");
  await mkdir(stagingDirectory, { recursive: true });
  await writeFile(path.join(stagingDirectory, "work.json"), "{\"version\":", "utf8");

  assert.deepEqual(await run(["list", "--root", root]), []);
});

test("rejects unsafe work item IDs when resuming", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  await assert.rejects(
    run(["resume", "--root", root, "../../package.json"]),
    /Invalid work item ID/,
  );
});

for (const option of ["--acceptnace", "--acceptnace=Expected result", "--command", "--positionals"]) {
  test(`rejects unknown option ${option} before creating artifacts`, async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), "work-item-option-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("../scripts/work-item.mjs", import.meta.url)),
      "create", "--root", root, "--request", "Keep acceptance criteria",
      option, ...(option.includes("=") ? [] : ["Expected result"]),
    ], { encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Unknown option --(?:acceptnace|command|positionals)/);
    assert.deepEqual(await readdir(root), []);
  });
}

test("keeps supported equals syntax and repeated acceptance criteria", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-option-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const item = await run([
    "create", `--root=${root}`, "--request=Keep all metadata", "--type=chore",
    "--owner=developer", "--risk=low", "--route=direct", "--next=Verify result",
    "--acceptance=First criterion", "--acceptance", "Second criterion",
  ]);
  assert.equal(item.type, "chore");
  assert.equal(item.risk, "low");
  assert.equal(item.route, "direct");
  assert.equal(item.owner, "developer");
  assert.equal(item.nextAction, "Verify result");
  assert.equal(item.request, "Keep all metadata");
  assert.deepEqual(item.acceptanceCriteria, ["First criterion", "Second criterion"]);
});
