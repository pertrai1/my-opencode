import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export default function prompt({ vars }) {
  const repository = fileURLToPath(new URL("../../", import.meta.url));
  const source = readFileSync(resolve(repository, vars.agent), "utf8");
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
}
