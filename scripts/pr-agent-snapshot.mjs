import { lstatSync } from "node:fs";
import { join } from "node:path";
import { checkedOutput, runProcess } from "./pr-agent-process.mjs";

export function safePath(path) {
  if (typeof path !== "string" || path.length === 0) return false;
  return relativePath(path) && printablePath(path);
}

function relativePath(path) {
  return !path.startsWith("/") && !path.split("/").some(part => part === ".." || part === ".");
}

function printablePath(path) {
  return ![...path].some(char => char === "\\" || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
}

function sensitivePath(path) {
  return /(^|\/)(\.env($|\.)|\.secrets|id_(rsa|ed25519)|credentials($|\.)|[^/]+\.(pem|key|p12|pfx)$)/i.test(path);
}

function headerPath(chunk, marker) {
  const value = chunk.match(new RegExp(`^${marker} (.+)$`, "m"))?.[1];
  if (!value || value === "/dev/null") return null;
  const decoded = decodePath(value);
  if (!decoded) return null;
  const path = decoded.replace(/^[ab]\//, "");
  return safePath(path) ? path : null;
}

function decodePath(value) {
  if (value.startsWith('"')) {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value.replace(/\t.*$/, "");
}

export function patchFiles(patch) {
  return patch.split(/(?=^diff --git )/m).filter(chunk => chunk.startsWith("diff --git ")).map(chunk => ({
    chunk, oldPath: headerPath(chunk, "---"), newPath: headerPath(chunk, "\\+\\+\\+"),
  }));
}

function filterPatch(patch) {
  if (Buffer.byteLength(patch) > 16 * 1024 * 1024) throw new Error("Selected snapshot exceeds the 16 MiB limit; choose a narrower scope.");
  const excludedFiles = [];
  const chunks = patchFiles(patch).filter(({ oldPath, newPath }) => {
    const paths = [oldPath, newPath].filter(Boolean);
    if (!paths.length || paths.some(sensitivePath)) {
      excludedFiles.push(...(paths.length ? paths : ["binary, metadata-only, or unsupported path"]));
      return false;
    }
    return true;
  });
  const filtered = chunks.map(({ chunk }) => chunk).join("");
  if (!filtered.trim()) throw new Error("Selected diff is empty or contains no eligible text files.");
  return { patch: filtered, excludedFiles: [...new Set(excludedFiles)] };
}

const diffOptions = ["--no-ext-diff", "--no-textconv", "--no-color", "--no-renames", "--src-prefix=a/", "--dst-prefix=b/"];

function untrackedFiles(git) {
  return git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
}

function eligibleUntracked(root, path) {
  return safePath(path) && !sensitivePath(path) && lstatSync(join(root, path)).isFile();
}

function untrackedPatch(root, git, execute) {
  return untrackedFiles(git).filter(path => eligibleUntracked(root, path)).map(path =>
    checkedOutput("git", ["-c", "core.quotePath=false", "diff", ...diffOptions, "--no-index", "--", "/dev/null", path], { cwd: root, execute, statuses: [0, 1] })).join("");
}

function workingSnapshot(options, root, git, execute) {
  const head = git(["rev-parse", "--verify", "HEAD^{commit}"]).trim();
  const collect = () => {
    const diff = git(["diff", ...diffOptions, ...(options.scope === "staged" ? ["--cached"] : []), head, "--"]);
    return options.scope === "staged" ? diff : diff + untrackedPatch(root, git, execute);
  };
  const patch = collect();
  if (patch !== collect() || git(["rev-parse", "HEAD"]).trim() !== head) throw new Error("Working snapshot changed during capture; retry.");
  const excluded = options.scope === "staged" ? [] : untrackedFiles(git).filter(sensitivePath);
  return { patch, head, scope: options.scope ?? "working", excludedFiles: excluded };
}

function localSnapshot(options, cwd, execute) {
  const git = args => checkedOutput("git", ["-c", "core.quotePath=false", ...args], { cwd, execute });
  const root = git(["rev-parse", "--show-toplevel"]).trim();
  if (root !== cwd) return localSnapshot(options, root, execute);
  const head = git(["rev-parse", "--verify", "HEAD^{commit}"]).trim();
  if (options.base) {
    const base = git(["rev-parse", "--verify", "--end-of-options", `${options.base}^{commit}`]).trim();
    const mergeBase = git(["merge-base", base, head]).trim();
    return { patch: git(["diff", ...diffOptions, mergeBase, head, "--"]), head, base, mergeBase, scope: "branch" };
  }
  return workingSnapshot(options, root, git, execute);
}

function prSnapshot(pr, cwd, execute) {
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d*\/?$/.test(pr)) throw new Error("PR scope requires a github.com pull request URL.");
  const gh = args => checkedOutput("gh", ["pr", ...args], { cwd, execute });
  const revisions = () => JSON.parse(gh(["view", pr, "--json", "baseRefOid,headRefOid"]));
  const before = revisions();
  const patch = gh(["diff", pr, "--color", "never"]);
  const after = revisions();
  if (before.headRefOid !== after.headRefOid || before.baseRefOid !== after.baseRefOid) throw new Error("PR changed during capture; retry.");
  if (!/^[a-f0-9]{40}$/.test(before.headRefOid) || !/^[a-f0-9]{40}$/.test(before.baseRefOid)) throw new Error("Invalid PR revisions.");
  return { patch, head: before.headRefOid, base: before.baseRefOid, scope: "pr", pr };
}

export function captureSnapshot(options = {}, { cwd = process.cwd(), execute = runProcess } = {}) {
  if ([options.base, options.pr, options.scope].filter(Boolean).length > 1) throw new Error("Choose one scope: --scope, --base, or --pr.");
  if (options.scope && !["working", "staged"].includes(options.scope)) throw new Error("Unknown scope; use working or staged.");
  const snapshot = options.pr ? prSnapshot(options.pr, cwd, execute) : localSnapshot(options, cwd, execute);
  const filtered = filterPatch(snapshot.patch);
  return { ...snapshot, ...filtered, excludedFiles: [...(snapshot.excludedFiles ?? []), ...filtered.excludedFiles], capturedAt: new Date().toISOString() };
}
