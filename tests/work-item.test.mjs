import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
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

function unitSection(id, name, stories, { measurement = true, bolts = true, dependsOn = [] } = {}) {
  return [
    `## ${id}: ${name}`,
    `- Stories: ${stories.join(", ")}`,
    ...(dependsOn.length ? [`- Depends on: ${dependsOn.join(", ")}`] : []),
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

test("approval rejects artifact stories and dependencies that differ from registered units", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await readyIntent(root);
  const file = inceptionPath(root, item.id, "units.md");
  const original = await readFile(file, "utf8");
  for (const section of [
    original.replace("Stories: US-1", "Stories: US-999"),
    original.replace("- Stories: US-1", ""),
    `${original}\n- Depends on: u-missing\n`,
    `${original}\n- Stories: US-1\n`,
  ]) {
    await writeFile(file, section);
    await assert.rejects(run(["approve-inception", "--root", root, item.id]), /units.md.*(Stories|Depends on)/);
    assert.equal((await run(["show", "--root", root, item.id])).inception.approved, false);
  }
});

test("approval requires artifact dependencies and compares normalized sets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await readyIntent(root, [
    { name: "Cart", stories: ["US-1", "US-2"] },
    { name: "Checkout", stories: ["US-3"], dependsOn: ["u-cart"] },
  ]);
  const file = inceptionPath(root, item.id, "units.md");
  const original = await readFile(file, "utf8");
  await writeFile(file, original.replace("- Depends on: u-cart", ""));
  await assert.rejects(run(["approve-inception", "--root", root, item.id]), /units.md.*Depends on/);
  await writeFile(file, original.replace("Stories: US-1, US-2", "Stories:  US-2 , US-1 "));
  assert.equal((await run(["approve-inception", "--root", root, item.id])).inception.approved, true);
});

test("inception snapshots distinguish pre-existing files from delegation changes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await readyIntent(root);
  const other = await readyIntent(root);
  const snapshot = () => run(["snapshot-inception", "--root", root, item.id]);
  const before = await snapshot();
  assert.deepEqual(await snapshot(), before, "creation artifacts are a stable baseline");
  const changedPaths = (after) => [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])]
    .filter((file) => before.files[file] !== after.files[file]);
  await writeFile(inceptionPath(root, item.id, "plan.md"), "updated plan");
  let after = await snapshot();
  assert.deepEqual(changedPaths(after), [`${item.id}/inception/plan.md`]);
  await writeFile(inceptionPath(root, other.id, "units.md"), "changed already-untracked content");
  await rm(path.join(root, ".agents/work", item.id, "request.md"));
  await writeFile(path.join(root, ".agents/work", "unexpected.md"), "outside active item");
  after = await snapshot();
  assert.deepEqual(changedPaths(after).sort(), [
    `${item.id}/inception/plan.md`, `${other.id}/inception/units.md`,
    `${item.id}/request.md`, "unexpected.md",
  ].sort());
  assert.equal(after.workId, item.id);
  assert.equal(after.root, root);
});

test("inception snapshots fail closed on symbolic links", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await readyIntent(root);
  await symlink(root, inceptionPath(root, item.id, "outside"));
  await assert.rejects(run(["snapshot-inception", "--root", root, item.id]), /symbolic link/);
});


test("approval rejects blank required unit fields instead of borrowing the next line", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-"));
  const item = await readyIntent(root);
  const file = inceptionPath(root, item.id, "units.md");
  const original = await readFile(file, "utf8");
  for (const label of ["Measurement criteria", "Suggested bolts"]) {
    for (const newline of ["\n", "\r\n"]) {
      const blank = original.replace(new RegExp(`${label}:.*`), `${label}: \t`);
      await writeFile(file, `${blank}\n- Notes: This later line is not the required value\n`.replace(/\n/g, newline));
      await assert.rejects(run(["approve-inception", "--root", root, item.id]), /missing (measurement criteria|suggested bolts)/);
      assert.equal((await run(["show", "--root", root, item.id])).inception.approved, false);
    }
  }
  await writeFile(file, original);
  assert.equal((await run(["approve-inception", "--root", root, item.id])).inception.approved, true);
});

test("explicit root keeps inception operations in the target rather than the shell working directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "work-item-target-"));
  const cwd = await mkdtemp(path.join(os.tmpdir(), "work-item-harness-"));
  const item = await createIntent(root);
  const script = path.resolve(import.meta.dirname, "../scripts/work-item.mjs");
  const invoke = (args) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
  const implicit = invoke(["resume", item.id]);
  assert.notEqual(implicit.status, 0, "omitting --root looks in the wrong worktree");
  const initialized = invoke(["init-inception", "--root", root, item.id]);
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.equal(JSON.parse(initialized.stdout).id, item.id);
  assert.equal((await run(["resume", "--root", root, item.id])).status, "inception");
  await assert.rejects(access(path.join(cwd, ".agents/work")), { code: "ENOENT" });
});
