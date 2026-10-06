import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const requirements = {
  node: packageJson.engines?.node,
  npm: packageJson.engines?.npm,
};
const versions = {
  node: process.versions.node,
  npm: process.env.npm_config_user_agent?.match(/npm\/(\d+\.\d+\.\d+)/)?.[1],
};

function majorVersion(version) {
  return Number.parseInt(version?.split(".")[0] ?? "", 10);
}

function matchesMajorRange(version, range) {
  const match = range?.match(/^>=(\d+)\s+<(\d+)$/);
  if (!match || !version) {
    return false;
  }

  const major = majorVersion(version);
  return major >= Number(match[1]) && major < Number(match[2]);
}

const mismatches = Object.entries(requirements)
  .filter(([name, range]) => !matchesMajorRange(versions[name], range))
  .map(([name, range]) => `${name} ${versions[name] ?? "unknown"} does not satisfy ${range}`);

if (mismatches.length > 0) {
  console.error("Toolchain mismatch:");
  console.error(mismatches.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Toolchain OK", { node: versions.node, npm: versions.npm });
}
