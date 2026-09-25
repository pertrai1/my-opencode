#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WORK_ITEM_VERSION = 1;
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
    if (key === "acceptance") {
      options.acceptance ??= [];
      options.acceptance.push(value);
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

async function showCommand(options) {
  const id = options.positionals[0];
  if (!id) throw new Error("A work item ID is required.");
  validateId(id);
  const content = await readFile(getWorkItemPath(getRoot(options), id), "utf8");
  return JSON.parse(content);
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
      items.push(JSON.parse(await readFile(path.join(directory, entry.name, "work.json"), "utf8")));
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
    default:
      throw new Error("Usage: work-item.mjs <create|show|resume|list> [options]");
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
