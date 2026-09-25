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

function inceptionPath(root, id, name) {
  return path.join(root, ".agents/work", id, "inception", name);
}

function unitSection(id, name, stories, { measurement = true, bolts = true } = {}) {
  return [
    `## ${id}: ${name}`,
    `- Stories: ${stories.join(", ")}`,
    measurement ? "- Measurement criteria: conversion rate from recommendations" : null,
    bolts ? "- Suggested bolts: 1. data model, 2. API" : null,
    "",
  ].filter((line) => line !== null).join("\n");
}

async function writeInception(root, id, { stories, units }) {
  const storyText = stories.map((story) => `## ${story}: Story ${story}\n\nAs a user...\n`).join("\n");
  await writeFile(inceptionPath(root, id, "stories.md"), `# User stories\n\n${storyText}`, "utf8");
  const unitText = units.map((unit) => unitSection(unit.id, unit.name, unit.stories, unit)).join("\n");
  await writeFile(inceptionPath(root, id, "units.md"), `# Units\n\n${unitText}`, "utf8");
}

// Creates an intent with registered units and valid inception artifacts.
async function readyIntent(root, units = [{ name: "Checkout", stories: ["US-1"] }]) {
  const item = await createIntent(root);
  await run(["init-inception", "--root", root, item.id]);
  const registered = [];
  for (const unit of units) {
    const args = ["add-unit", "--root", root, item.id, "--name", unit.name];
    for (const story of unit.stories) args.push("--story", story);
    for (const dependency of unit.dependsOn ?? []) args.push("--depends-on", dependency);
    const updated = await run(args);
    registered.push({ ...unit, id: updated.units.at(-1).id });
  }
  await writeInception(root, item.id, { stories: units.flatMap((unit) => unit.stories), units: registered });
  return item;
}

test("approve-inception requires at least one unit and freezes the unit set", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const empty = await createIntent(root);
  await run(["init-inception", "--root", root, empty.id]);
  await assert.rejects(run(["approve-inception", "--root", root, empty.id]), /at least one unit/);

  const item = await readyIntent(root);
  const approved = await run(["approve-inception", "--root", root, item.id, "--by", "rob", "--note", "Mob reviewed"]);
  assert.equal(approved.status, "inception-approved");
  assert.equal(approved.inception.approved, true);
  assert.equal(approved.inception.approvedBy, "rob");
  assert.deepEqual(approved.units.map((unit) => unit.status), ["approved"]);
  assert.equal(approved.history.at(-1).note, "Mob reviewed");

  await assert.rejects(run(["add-unit", "--root", root, item.id, "--name", "Late"]), /already approved/);
});

test("approve-inception rejects units that reference missing stories or have none", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await readyIntent(root, [{ name: "Checkout", stories: ["US-1"] }, { name: "Billing", stories: [] }]);
  await run(["update-unit", "--root", root, item.id, "u-checkout", "--story", "US-1", "--story", "US-9"]);

  await assert.rejects(run(["approve-inception", "--root", root, item.id]), (error) => {
    assert.match(error.message, /u-checkout references story US-9, which is not in stories\.md/);
    assert.match(error.message, /u-billing has no stories/);
    return true;
  });
});

test("approve-inception rejects uncovered, shared, and duplicated stories", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await readyIntent(root, [
    { name: "Checkout", stories: ["US-1"] },
    { name: "Billing", stories: ["US-2"] },
  ]);
  await writeFile(
    inceptionPath(root, item.id, "stories.md"),
    "# User stories\n\n## US-1: A\n\n## US-2: B\n\n## US-2: B again\n\n## US-3: C\n",
    "utf8",
  );
  await run(["update-unit", "--root", root, item.id, "u-billing", "--story", "US-1", "--story", "US-2"]);

  await assert.rejects(run(["approve-inception", "--root", root, item.id]), (error) => {
    assert.match(error.message, /stories\.md defines US-2 more than once/);
    assert.match(error.message, /US-3 is not assigned to any unit/);
    assert.match(error.message, /US-1 is assigned to more than one unit: u-checkout, u-billing/);
    return true;
  });
});

test("approve-inception requires a units.md section with measurement criteria and bolts for each unit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await readyIntent(root, [
    { name: "Checkout", stories: ["US-1"] },
    { name: "Billing", stories: ["US-2"] },
    { name: "Search", stories: ["US-3"] },
  ]);
  await writeFile(
    inceptionPath(root, item.id, "units.md"),
    [
      "# Units",
      "<!-- ## u-search: commented-out headings do not count -->",
      unitSection("u-checkout", "Checkout", ["US-1"], { measurement: false }),
      unitSection("u-billing", "Billing", ["US-2"], { bolts: false }),
      unitSection("u-ghost", "Ghost", ["US-3"]),
    ].join("\n"),
    "utf8",
  );

  await assert.rejects(run(["approve-inception", "--root", root, item.id]), (error) => {
    assert.match(error.message, /u-checkout is missing measurement criteria in units\.md/);
    assert.match(error.message, /u-billing is missing suggested bolts in units\.md/);
    assert.match(error.message, /u-search has no section in units\.md/);
    assert.match(error.message, /units\.md describes u-ghost, which is not a registered unit/);
    return true;
  });
});

test("update-unit replaces summary, stories, and dependencies before approval", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await createIntent(root);
  await run(["init-inception", "--root", root, item.id]);
  await run(["add-unit", "--root", root, item.id, "--name", "Cart", "--story", "US-1"]);
  await run(["add-unit", "--root", root, item.id, "--name", "Checkout", "--story", "US-2", "--depends-on", "u-cart"]);

  const updated = await run([
    "update-unit", "--root", root, item.id, "u-checkout",
    "--summary", "Pay for the cart", "--story", "US-2", "--story", "US-3", "--clear-dependencies",
  ]);
  assert.deepEqual(updated.units[1], {
    id: "u-checkout",
    name: "Checkout",
    summary: "Pay for the cart",
    stories: ["US-2", "US-3"],
    dependsOn: [],
    status: "proposed",
    change: null,
  });
  assert.deepEqual(updated.units[0].stories, ["US-1"]);
});

test("update-unit rejects unknown units, self-dependencies, and dependency cycles", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await createIntent(root);
  await run(["init-inception", "--root", root, item.id]);
  await run(["add-unit", "--root", root, item.id, "--name", "Cart"]);
  await run(["add-unit", "--root", root, item.id, "--name", "Checkout", "--depends-on", "u-cart"]);

  await assert.rejects(run(["update-unit", "--root", root, item.id, "u-missing", "--summary", "x"]), /Unknown unit/);
  await assert.rejects(
    run(["update-unit", "--root", root, item.id, "u-cart", "--depends-on", "u-cart"]),
    /cannot depend on itself/,
  );
  await assert.rejects(
    run(["update-unit", "--root", root, item.id, "u-cart", "--depends-on", "u-checkout"]),
    /dependency cycle/,
  );
});

test("remove-unit deletes a proposed unit unless another unit depends on it", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await createIntent(root);
  await run(["init-inception", "--root", root, item.id]);
  await run(["add-unit", "--root", root, item.id, "--name", "Cart"]);
  await run(["add-unit", "--root", root, item.id, "--name", "Checkout", "--depends-on", "u-cart"]);

  await assert.rejects(run(["remove-unit", "--root", root, item.id, "u-cart"]), /u-checkout depends on it/);
  const updated = await run(["remove-unit", "--root", root, item.id, "u-checkout"]);
  assert.deepEqual(updated.units.map((unit) => unit.id), ["u-cart"]);
});

test("update-unit and remove-unit are rejected after approval", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await readyIntent(root);
  await run(["approve-inception", "--root", root, item.id]);
  await assert.rejects(run(["update-unit", "--root", root, item.id, "u-checkout", "--summary", "x"]), /already approved/);
  await assert.rejects(run(["remove-unit", "--root", root, item.id, "u-checkout"]), /already approved/);
});

test("link-unit binds an approved unit to an OpenSpec change", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await readyIntent(root);
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
  assert.equal(linked.units[0].status, "linked");
  assert.equal(linked.units[0].change, "add-checkout");
  assert.deepEqual(linked.relationships, [{ kind: "openspec-change", ref: "add-checkout", unit: "u-checkout" }]);
});

test("link-unit is idempotent for the same change and rejects a different one", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await readyIntent(root);
  await run(["approve-inception", "--root", root, item.id]);
  await run(["link-unit", "--root", root, item.id, "u-checkout", "--change", "add-checkout"]);

  const again = await run(["link-unit", "--root", root, item.id, "u-checkout", "--change", "add-checkout"]);
  assert.equal(again.relationships.length, 1);
  await assert.rejects(
    run(["link-unit", "--root", root, item.id, "u-checkout", "--change", "add-checkout-v2"]),
    /already linked to add-checkout/,
  );
});

test("link-unit rejects a change that is already linked to another unit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await readyIntent(root, [
    { name: "Checkout", stories: ["US-1"] },
    { name: "Billing", stories: ["US-2"] },
  ]);
  await run(["approve-inception", "--root", root, item.id]);
  await run(["link-unit", "--root", root, item.id, "u-checkout", "--change", "add-checkout"]);
  await assert.rejects(
    run(["link-unit", "--root", root, item.id, "u-billing", "--change", "add-checkout"]),
    /add-checkout is already linked to u-checkout/,
  );
});

test("link-unit requires dependencies to be linked unless parallel work is approved", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await readyIntent(root, [
    { name: "Cart", stories: ["US-1"] },
    { name: "Checkout", stories: ["US-2"], dependsOn: ["u-cart"] },
  ]);
  await run(["approve-inception", "--root", root, item.id]);

  await assert.rejects(
    run(["link-unit", "--root", root, item.id, "u-checkout", "--change", "add-checkout"]),
    /u-checkout depends on unlinked units: u-cart/,
  );
  await assert.rejects(
    run(["link-unit", "--root", root, item.id, "u-checkout", "--change", "add-checkout", "--parallel"]),
    /--parallel requires --note/,
  );

  const linked = await run([
    "link-unit", "--root", root, item.id, "u-checkout", "--change", "add-checkout",
    "--parallel", "--note", "Rob approved building checkout against a cart stub",
  ]);
  assert.equal(linked.units[1].status, "linked");
  assert.match(linked.history.at(-1).note, /parallel work approved: Rob approved building checkout/);
});

test("every state change rewrites progress.md from the work item", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await readyIntent(root, [
    { name: "Cart", stories: ["US-1"] },
    { name: "Checkout", stories: ["US-2"], dependsOn: ["u-cart"] },
  ]);
  const progressPath = path.join(root, ".agents/work", item.id, "progress.md");
  assert.match(await readFile(progressPath, "utf8"), /- Status: inception\n/);

  await run(["approve-inception", "--root", root, item.id]);
  await run(["link-unit", "--root", root, item.id, "u-cart", "--change", "add-cart"]);
  const progress = await readFile(progressPath, "utf8");
  assert.match(progress, /- Status: inception-approved\n/);
  assert.match(progress, /- Next action: Start an OpenSpec change for u-checkout, then run link-unit\./);
  assert.match(progress, /\| u-cart \| linked \| add-cart \|/);
  assert.match(progress, /\| u-checkout \| approved \| - \|/);
});
