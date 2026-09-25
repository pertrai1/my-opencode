import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

  assert.equal(item.version, 2);
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

test("rejects unsafe work item IDs when resuming", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  await assert.rejects(
    run(["resume", "--root", root, "../../package.json"]),
    /Invalid work item ID/,
  );
});

async function createIntent(root) {
  return run(["create", "--root", root, "--request", "Build a cross-sell recommendation engine", "--type", "feature"]);
}

test("new work items start with no units and no inception approval", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await createIntent(root);
  assert.equal(item.version, 2);
  assert.deepEqual(item.units, []);
  assert.equal(item.inception, null);
});

test("resuming a version 1 record normalizes missing inception fields", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await createIntent(root);
  const file = path.join(root, ".agents/work", item.id, "work.json");
  const legacy = { ...item, version: 1 };
  delete legacy.units;
  delete legacy.inception;
  await writeFile(file, JSON.stringify(legacy), "utf8");

  const resumed = await run(["resume", "--root", root, item.id]);
  assert.deepEqual(resumed.units, []);
  assert.equal(resumed.inception, null);
});

test("init-inception scaffolds the inception artifacts and records them", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await createIntent(root);
  const updated = await run(["init-inception", "--root", root, item.id]);

  const directory = path.join(root, ".agents/work", item.id, "inception");
  for (const name of ["plan.md", "stories.md", "nfr.md", "risks.md", "units.md"]) {
    await access(path.join(directory, name));
  }
  assert.equal(updated.status, "inception");
  assert.equal(updated.inception.approved, false);
  assert.ok(updated.artifacts.includes(`.agents/work/${item.id}/inception/units.md`));
});

test("init-inception does not overwrite artifacts that already exist", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await createIntent(root);
  await run(["init-inception", "--root", root, item.id]);
  const stories = path.join(root, ".agents/work", item.id, "inception", "stories.md");
  await writeFile(stories, "# Edited by a human\n", "utf8");

  await run(["init-inception", "--root", root, item.id]);
  assert.equal(await readFile(stories, "utf8"), "# Edited by a human\n");
});

test("add-unit registers a proposed unit with stories and dependencies", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await createIntent(root);
  await run(["init-inception", "--root", root, item.id]);
  await run(["add-unit", "--root", root, item.id, "--name", "User Data Collection", "--story", "US-1"]);
  const updated = await run([
    "add-unit", "--root", root, item.id,
    "--name", "Recommendation Algorithm",
    "--summary", "Collaborative filtering over purchase history",
    "--story", "US-2", "--story", "US-3",
    "--depends-on", "u-user-data-collection",
  ]);

  assert.deepEqual(updated.units.map((unit) => unit.id), ["u-user-data-collection", "u-recommendation-algorithm"]);
  assert.deepEqual(updated.units[1], {
    id: "u-recommendation-algorithm",
    name: "Recommendation Algorithm",
    summary: "Collaborative filtering over purchase history",
    stories: ["US-2", "US-3"],
    dependsOn: ["u-user-data-collection"],
    status: "proposed",
    change: null,
  });
});

test("add-unit rejects duplicates, unknown dependencies, and units before inception", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await createIntent(root);
  await assert.rejects(run(["add-unit", "--root", root, item.id, "--name", "Early"]), /init-inception/);

  await run(["init-inception", "--root", root, item.id]);
  await run(["add-unit", "--root", root, item.id, "--name", "Checkout"]);
  await assert.rejects(run(["add-unit", "--root", root, item.id, "--name", "Checkout"]), /already exists/);
  await assert.rejects(
    run(["add-unit", "--root", root, item.id, "--name", "Billing", "--depends-on", "u-missing"]),
    /Unknown unit dependency/,
  );
});

test("approve-inception requires at least one unit and freezes the unit set", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await createIntent(root);
  await run(["init-inception", "--root", root, item.id]);
  await assert.rejects(run(["approve-inception", "--root", root, item.id]), /at least one unit/);

  await run(["add-unit", "--root", root, item.id, "--name", "Checkout"]);
  const approved = await run(["approve-inception", "--root", root, item.id, "--by", "rob", "--note", "Mob reviewed"]);
  assert.equal(approved.status, "inception-approved");
  assert.equal(approved.inception.approved, true);
  assert.equal(approved.inception.approvedBy, "rob");
  assert.deepEqual(approved.units.map((unit) => unit.status), ["approved"]);
  assert.equal(approved.history.at(-1).note, "Mob reviewed");

  await assert.rejects(run(["add-unit", "--root", root, item.id, "--name", "Late"]), /already approved/);
});

test("link-unit binds an approved unit to an OpenSpec change", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await createIntent(root);
  await run(["init-inception", "--root", root, item.id]);
  await run(["add-unit", "--root", root, item.id, "--name", "Checkout"]);
  await assert.rejects(
    run(["link-unit", "--root", root, item.id, "u-checkout", "--change", "add-checkout"]),
    /not approved/,
  );

  await run(["approve-inception", "--root", root, item.id]);
  await assert.rejects(
    run(["link-unit", "--root", root, item.id, "u-missing", "--change", "add-checkout"]),
    /Unknown unit/,
  );
  await assert.rejects(
    run(["link-unit", "--root", root, item.id, "u-checkout", "--change", "../escape"]),
    /Invalid OpenSpec change name/,
  );

  const linked = await run(["link-unit", "--root", root, item.id, "u-checkout", "--change", "add-checkout"]);
  assert.deepEqual(linked.units[0], { ...linked.units[0], status: "linked", change: "add-checkout" });
  assert.ok(linked.relationships.some((rel) => rel.kind === "openspec-change" && rel.ref === "add-checkout" && rel.unit === "u-checkout"));
});
