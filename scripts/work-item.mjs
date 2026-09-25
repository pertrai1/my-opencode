#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WORK_ITEM_VERSION = 2;
const REPEATABLE_OPTIONS = new Set(["acceptance", "story", "depends-on"]);
const FLAG_OPTIONS = new Set(["parallel", "clear-dependencies"]);
const REQUEST_TYPES = new Set([
  "feature",
  "defect",
  "brainstorm",
  "chore",
  "investigation",
  "operational",
  "other",
]);

function parseArgs(argv) {
  const [command = "help", ...tokens] = argv;
  const options = { command, positionals: [] };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      options.positionals.push(token);
      continue;
    }

    const separator = token.indexOf("=");
    const key = token.slice(2, separator === -1 ? undefined : separator);
    if (FLAG_OPTIONS.has(key)) {
      options[key] = true;
      continue;
    }
    const value = separator === -1 ? tokens[++index] : token.slice(separator + 1);
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    if (REPEATABLE_OPTIONS.has(key)) {
      options[key] ??= [];
      options[key].push(value);
    } else {
      options[key] = value;
    }
  }

  return options;
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug.length > 0 ? slug : "work-item";
}

function getRoot(options) {
  return path.resolve(options.root ?? process.cwd());
}

function getWorkDirectory(root, id) {
  return path.join(root, ".agents", "work", id);
}

function getWorkItemPath(root, id) {
  return path.join(getWorkDirectory(root, id), "work.json");
}

function validateId(id) {
  if (!/^wi-[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+-[0-9a-f]{8}$/.test(id)) {
    throw new Error(`Invalid work item ID: ${id}`);
  }
}

function formatRequest(value) {
  return value.trim().replace(/\s+/g, " ");
}

function validateType(type) {
  if (!REQUEST_TYPES.has(type)) {
    throw new Error(`Unsupported request type: ${type}`);
  }
}

export function createWorkItem(options, now = new Date()) {
  const request = formatRequest(options.request ?? options.positionals.join(" "));
  if (!request) {
    throw new Error("A request is required. Use --request or provide a positional request.");
  }

  const type = options.type ?? "other";
  validateType(type);

  const timestamp = now.toISOString();
  const stamp = timestamp.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const id = `wi-${stamp}-${slugify(request)}-${randomUUID().slice(0, 8)}`;

  return {
    version: WORK_ITEM_VERSION,
    id,
    source: { kind: "local", ref: null },
    request,
    type,
    status: "new",
    owner: options.owner ?? "unassigned",
    risk: options.risk ?? "unknown",
    route: options.route ?? "unselected",
    acceptanceCriteria: options.acceptance ?? [],
    artifacts: [],
    evidence: [],
    relationships: [],
    units: [],
    inception: null,
    nextAction: options.next ?? "Triage the request and select a route.",
    history: [{ at: timestamp, status: "new", note: "Work item created locally." }],
  };
}

function renderProgress(item) {
  const lines = [`# Progress: ${item.id}`, "", `- Status: ${item.status}`, `- Next action: ${item.nextAction}`];
  if (item.units?.length > 0) {
    lines.push("", "## Units", "", "| Unit | Status | Change |", "| --- | --- | --- |");
    for (const unit of item.units) lines.push(`| ${unit.id} | ${unit.status} | ${unit.change ?? "-"} |`);
  }
  return `${lines.join("\n")}\n`;
}

// Writes to a sibling temp file and renames it, so readers never see a partial file.
async function writeFileAtomic(file, content) {
  const temporary = `${file}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, file);
}

async function writeWorkItem(root, item) {
  const directory = getWorkDirectory(root, item.id);
  await mkdir(directory, { recursive: false });
  await writeFile(
    getWorkItemPath(root, item.id),
    `${JSON.stringify(item, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(directory, "request.md"),
    `# ${item.id}\n\n${item.request}\n`,
    "utf8",
  );
  await writeFile(path.join(directory, "progress.md"), renderProgress(item), "utf8");
}

async function createCommand(options) {
  const root = getRoot(options);
  const item = createWorkItem(options);
  await mkdir(path.join(root, ".agents", "work"), { recursive: true });
  await writeWorkItem(root, item);
  return item;
}

function normalizeWorkItem(item) {
  return { ...item, units: item.units ?? [], inception: item.inception ?? null };
}

async function loadWorkItem(options) {
  const id = options.positionals[0];
  if (!id) throw new Error("A work item ID is required.");
  validateId(id);
  const content = await readFile(getWorkItemPath(getRoot(options), id), "utf8");
  return normalizeWorkItem(JSON.parse(content));
}

async function saveWorkItem(options, item, status, note, now = new Date()) {
  const at = now.toISOString();
  const updated = { ...item, version: WORK_ITEM_VERSION, status, history: [...item.history, { at, status, note }] };
  const root = getRoot(options);
  // work.json is the source of truth; progress.md is a rendered view written after it.
  await writeFileAtomic(getWorkItemPath(root, item.id), `${JSON.stringify(updated, null, 2)}\n`);
  await writeFileAtomic(path.join(getWorkDirectory(root, item.id), "progress.md"), renderProgress(updated));
  return updated;
}

async function showCommand(options) {
  return loadWorkItem(options);
}

const INCEPTION_TEMPLATES = {
  "plan.md": (item) => `# Inception plan: ${item.id}

Intent: ${item.request}

Write the plan as checkboxes. Mark any step that needs a human decision with **NEEDS CONFIRMATION**.
Do not execute the plan until the human approves it.

- [ ] Ask clarifying questions about users, outcomes, and constraints
- [ ] Draft user stories with acceptance criteria (stories.md)
- [ ] Draft non-functional requirements (nfr.md)
- [ ] Draft risks, matched to the organization's risk register if one exists (risks.md)
- [ ] Group stories into loosely coupled units and suggest bolts (units.md)
- [ ] Present all artifacts for human approval
`,
  "stories.md": () => `# User stories

<!-- One heading per story: ## US-<n>: <title>, followed by the story and acceptance criteria. -->
`,
  "nfr.md": () => `# Non-functional requirements

<!-- One heading per requirement: ## NFR-<n>: <title>, with a measurable target. -->
`,
  "risks.md": () => `# Risks

<!-- One heading per risk: ## RISK-<n>: <title>, with likelihood, impact, and mitigation. -->
`,
  "units.md": () => `# Units

<!-- One heading per unit, matching the unit ID registered with work-item.mjs add-unit:
## u-<slug>: <name>
- Stories: US-1, US-2
- Depends on: u-<other>
- Measurement criteria: how this unit traces to the business intent
- Suggested bolts: ordered, each small enough to build and validate in hours -->
`,
};

async function initInceptionCommand(options) {
  const item = await loadWorkItem(options);
  if (item.inception?.approved) throw new Error(`Inception for ${item.id} is already approved.`);

  const relative = path.join(".agents", "work", item.id, "inception");
  const directory = path.join(getRoot(options), relative);
  await mkdir(directory, { recursive: true });
  const artifacts = [...item.artifacts];
  for (const [name, template] of Object.entries(INCEPTION_TEMPLATES)) {
    try {
      await writeFile(path.join(directory, name), template(item), { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const artifact = path.posix.join(".agents/work", item.id, "inception", name);
    if (!artifacts.includes(artifact)) artifacts.push(artifact);
  }

  return saveWorkItem(
    options,
    {
      ...item,
      artifacts,
      inception: item.inception ?? { approved: false, approvedAt: null, approvedBy: null },
      nextAction: "Delegate to inception-author in plan mode and get human approval of plan.md.",
    },
    "inception",
    "Inception artifacts scaffolded.",
  );
}

function requireOpenInception(item) {
  if (!item.inception) throw new Error(`Run init-inception for ${item.id} first.`);
  if (item.inception.approved) throw new Error(`Inception for ${item.id} is already approved; units are frozen.`);
}

async function addUnitCommand(options) {
  const item = await loadWorkItem(options);
  requireOpenInception(item);
  const name = formatRequest(options.name ?? "");
  if (!name) throw new Error("A unit name is required. Use --name.");

  const id = `u-${slugify(name)}`;
  if (item.units.some((unit) => unit.id === id)) throw new Error(`Unit ${id} already exists.`);
  const dependsOn = options["depends-on"] ?? [];
  validateDependencies(item.units, id, dependsOn);

  const unit = {
    id,
    name,
    summary: options.summary ?? "",
    stories: options.story ?? [],
    dependsOn,
    status: "proposed",
    change: null,
  };
  return saveWorkItem(options, { ...item, units: [...item.units, unit] }, item.status, `Unit ${id} proposed.`);
}

function findUnit(item, unitId) {
  const unit = item.units.find((candidate) => candidate.id === unitId);
  if (!unit) throw new Error(`Unknown unit: ${unitId}`);
  return unit;
}

function validateDependencies(units, unitId, dependsOn) {
  for (const dependency of dependsOn) {
    if (dependency === unitId) throw new Error(`Unit ${unitId} cannot depend on itself.`);
    if (!units.some((unit) => unit.id === dependency)) throw new Error(`Unknown unit dependency: ${dependency}`);
  }

  const graph = new Map(units.map((unit) => [unit.id, unit.dependsOn]));
  graph.set(unitId, dependsOn);
  const visiting = new Set();
  const visited = new Set();
  const visit = (id, trail) => {
    if (visiting.has(id)) throw new Error(`Unit dependencies form a dependency cycle: ${[...trail, id].join(" -> ")}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of graph.get(id) ?? []) visit(next, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) visit(id, []);
}

async function updateUnitCommand(options) {
  const item = await loadWorkItem(options);
  requireOpenInception(item);
  const unit = findUnit(item, options.positionals[1]);

  const dependsOn = options["clear-dependencies"] ? [] : (options["depends-on"] ?? unit.dependsOn);
  validateDependencies(item.units, unit.id, dependsOn);
  const updatedUnit = {
    ...unit,
    summary: options.summary ?? unit.summary,
    stories: options.story ?? unit.stories,
    dependsOn,
  };
  return saveWorkItem(
    options,
    { ...item, units: item.units.map((candidate) => (candidate.id === unit.id ? updatedUnit : candidate)) },
    item.status,
    `Unit ${unit.id} updated.`,
  );
}

async function removeUnitCommand(options) {
  const item = await loadWorkItem(options);
  requireOpenInception(item);
  const unit = findUnit(item, options.positionals[1]);
  const dependents = item.units.filter((candidate) => candidate.dependsOn.includes(unit.id));
  if (dependents.length > 0) {
    throw new Error(`Cannot remove ${unit.id}: ${dependents.map((candidate) => candidate.id).join(", ")} depends on it.`);
  }
  return saveWorkItem(
    options,
    { ...item, units: item.units.filter((candidate) => candidate.id !== unit.id) },
    item.status,
    `Unit ${unit.id} removed.`,
  );
}

function stripComments(markdown) {
  return markdown.replace(/<!--[\s\S]*?-->/g, "");
}

async function readInceptionArtifact(root, item, name, errors) {
  try {
    return stripComments(await readFile(path.join(getWorkDirectory(root, item.id), "inception", name), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    errors.push(`${name} is missing`);
    return "";
  }
}

function parseUnitSections(markdown) {
  const sections = [];
  let current = null;
  for (const line of markdown.split("\n")) {
    const heading = line.match(/^##\s+(u-[a-z0-9-]+)\s*:/);
    if (heading) {
      current = { id: heading[1], body: "" };
      sections.push(current);
    } else if (/^##\s/.test(line)) {
      current = null;
    } else if (current) {
      current.body += `${line}\n`;
    }
  }
  return sections;
}

// Collects every reason the inception artifacts are not ready, so one run reports them all.
async function validateInception(root, item) {
  const errors = [];
  const storiesMarkdown = await readInceptionArtifact(root, item, "stories.md", errors);
  const unitsMarkdown = await readInceptionArtifact(root, item, "units.md", errors);

  const storyIds = [...storiesMarkdown.matchAll(/^##\s+(US-\d+)\s*:/gm)].map((match) => match[1]);
  const stories = new Set();
  for (const story of storyIds) {
    if (stories.has(story)) errors.push(`stories.md defines ${story} more than once`);
    stories.add(story);
  }

  const owners = new Map([...stories].map((story) => [story, []]));
  for (const unit of item.units) {
    if (unit.stories.length === 0) errors.push(`${unit.id} has no stories`);
    for (const story of new Set(unit.stories)) {
      if (!stories.has(story)) {
        errors.push(`${unit.id} references story ${story}, which is not in stories.md`);
      } else {
        owners.get(story).push(unit.id);
      }
    }
  }
  for (const [story, units] of owners) {
    if (units.length === 0) errors.push(`${story} is not assigned to any unit`);
    if (units.length > 1) errors.push(`${story} is assigned to more than one unit: ${units.join(", ")}`);
  }

  const sections = parseUnitSections(unitsMarkdown);
  const registered = new Set(item.units.map((unit) => unit.id));
  const described = new Set();
  for (const section of sections) {
    if (described.has(section.id)) errors.push(`units.md defines ${section.id} more than once`);
    described.add(section.id);
    if (!registered.has(section.id)) {
      errors.push(`units.md describes ${section.id}, which is not a registered unit`);
      continue;
    }
    if (!/^\s*[-*]?\s*Measurement criteria:\s*\S/im.test(section.body)) {
      errors.push(`${section.id} is missing measurement criteria in units.md`);
    }
    if (!/^\s*[-*]?\s*Suggested bolts:\s*\S/im.test(section.body)) {
      errors.push(`${section.id} is missing suggested bolts in units.md`);
    }
  }
  for (const unit of item.units) {
    if (!described.has(unit.id)) errors.push(`${unit.id} has no section in units.md`);
  }

  return errors;
}

function linkNextAction(units) {
  const remaining = units.filter((unit) => unit.status !== "linked").map((unit) => unit.id);
  if (remaining.length === 0) return "All units are linked. Continue each unit through its OpenSpec lifecycle.";
  return `Start an OpenSpec change for ${remaining.join(", ")}, then run link-unit.`;
}

async function approveInceptionCommand(options) {
  const item = await loadWorkItem(options);
  requireOpenInception(item);
  if (item.units.length === 0) throw new Error("Inception needs at least one unit before approval.");
  const errors = await validateInception(getRoot(options), item);
  if (errors.length > 0) {
    throw new Error(`Inception is not ready for approval:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }

  const now = new Date();
  const units = item.units.map((unit) => ({ ...unit, status: "approved" }));
  return saveWorkItem(
    options,
    {
      ...item,
      units,
      inception: { approved: true, approvedAt: now.toISOString(), approvedBy: options.by ?? "human" },
      nextAction: linkNextAction(units),
    },
    "inception-approved",
    options.note ?? "Inception approved by a human.",
    now,
  );
}

async function linkUnitCommand(options) {
  const item = await loadWorkItem(options);
  const change = options.change ?? "";
  if (!item.inception?.approved) throw new Error(`Inception for ${item.id} is not approved.`);
  const unit = findUnit(item, options.positionals[1]);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(change)) throw new Error(`Invalid OpenSpec change name: ${change}`);

  if (unit.status === "linked") {
    if (unit.change === change) return item;
    throw new Error(`Unit ${unit.id} is already linked to ${unit.change}.`);
  }
  const owner = item.units.find((candidate) => candidate.change === change);
  if (owner) throw new Error(`OpenSpec change ${change} is already linked to ${owner.id}.`);

  if (options.parallel && !options.note) {
    throw new Error("--parallel requires --note to record who approved the parallel work and why.");
  }
  const unlinked = unit.dependsOn.filter((id) => item.units.find((candidate) => candidate.id === id)?.status !== "linked");
  if (unlinked.length > 0 && !options.parallel) {
    throw new Error(
      `Unit ${unit.id} depends on unlinked units: ${unlinked.join(", ")}. Link them first, or pass --parallel with --note.`,
    );
  }

  const units = item.units.map((candidate) => (candidate.id === unit.id ? { ...candidate, status: "linked", change } : candidate));
  const note = unlinked.length > 0
    ? `Unit ${unit.id} linked to OpenSpec change ${change} before ${unlinked.join(", ")}; parallel work approved: ${options.note}`
    : `Unit ${unit.id} linked to OpenSpec change ${change}.`;
  return saveWorkItem(
    options,
    {
      ...item,
      units,
      relationships: [...item.relationships, { kind: "openspec-change", ref: change, unit: unit.id }],
      nextAction: linkNextAction(units),
    },
    item.status,
    note,
  );
}

async function listCommand(options) {
  const directory = path.join(getRoot(options), ".agents", "work");
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const items = [];
  for (const entry of entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    try {
      items.push(normalizeWorkItem(JSON.parse(await readFile(path.join(directory, entry.name, "work.json"), "utf8"))));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return items;
}

export async function run(argv) {
  const options = parseArgs(argv);
  switch (options.command) {
    case "create":
      return createCommand(options);
    case "show":
    case "resume":
      return showCommand(options);
    case "list":
      return listCommand(options);
    case "init-inception":
      return initInceptionCommand(options);
    case "add-unit":
      return addUnitCommand(options);
    case "update-unit":
      return updateUnitCommand(options);
    case "remove-unit":
      return removeUnitCommand(options);
    case "approve-inception":
      return approveInceptionCommand(options);
    case "link-unit":
      return linkUnitCommand(options);
    default:
      throw new Error(
        "Usage: work-item.mjs <create|show|resume|list|init-inception|add-unit|update-unit|remove-unit|approve-inception|link-unit> [options]",
      );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(await run(process.argv.slice(2)), null, 2)}\n`);
  } catch (error) {
    console.error("work-item command failed", { error: error.message });
    process.exitCode = 1;
  }
}
