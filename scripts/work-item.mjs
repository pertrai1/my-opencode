#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WORK_ITEM_VERSION = 2;
const REPEATABLE_OPTIONS = new Set(["acceptance", "story", "depends-on"]);
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
  await writeFile(
    path.join(directory, "progress.md"),
    `# Progress: ${item.id}\n\n- Status: ${item.status}\n- Next action: ${item.nextAction}\n`,
    "utf8",
  );
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
  await writeFile(getWorkItemPath(getRoot(options), item.id), `${JSON.stringify(updated, null, 2)}\n`, "utf8");
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
    { ...item, artifacts, inception: item.inception ?? { approved: false, approvedAt: null, approvedBy: null } },
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
  for (const dependency of dependsOn) {
    if (!item.units.some((unit) => unit.id === dependency)) throw new Error(`Unknown unit dependency: ${dependency}`);
  }

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

async function approveInceptionCommand(options) {
  const item = await loadWorkItem(options);
  requireOpenInception(item);
  if (item.units.length === 0) throw new Error("Inception needs at least one unit before approval.");

  const now = new Date();
  return saveWorkItem(
    options,
    {
      ...item,
      units: item.units.map((unit) => ({ ...unit, status: "approved" })),
      inception: { approved: true, approvedAt: now.toISOString(), approvedBy: options.by ?? "human" },
      nextAction: "Start an OpenSpec change for each approved unit, then run link-unit.",
    },
    "inception-approved",
    options.note ?? "Inception approved by a human.",
    now,
  );
}

async function linkUnitCommand(options) {
  const item = await loadWorkItem(options);
  const unitId = options.positionals[1];
  const change = options.change ?? "";
  if (!item.inception?.approved) throw new Error(`Inception for ${item.id} is not approved.`);
  const unit = item.units.find((candidate) => candidate.id === unitId);
  if (!unit) throw new Error(`Unknown unit: ${unitId}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(change)) throw new Error(`Invalid OpenSpec change name: ${change}`);

  return saveWorkItem(
    options,
    {
      ...item,
      units: item.units.map((candidate) => (candidate.id === unitId ? { ...candidate, status: "linked", change } : candidate)),
      relationships: [...item.relationships, { kind: "openspec-change", ref: change, unit: unitId }],
    },
    item.status,
    `Unit ${unitId} linked to OpenSpec change ${change}.`,
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
    case "approve-inception":
      return approveInceptionCommand(options);
    case "link-unit":
      return linkUnitCommand(options);
    default:
      throw new Error(
        "Usage: work-item.mjs <create|show|resume|list|init-inception|add-unit|approve-inception|link-unit> [options]",
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
