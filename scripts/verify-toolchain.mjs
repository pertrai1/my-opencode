import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const requirements = {
  node: packageJson.engines?.node,
  npm: packageJson.engines?.npm,
};
const versions = {
  node: process.versions.node,
  npm: process.env.npm_config_user_agent?.match(/npm\/([^\s]+)/)?.[1],
};

function versionParts(version) {
  if (!/^\d+(?:\.\d+){0,2}$/.test(version ?? "")) return null;
  const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
  return [major, minor, patch];
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

// Accept unions of bounded >=minimum <maximum ranges, not arbitrary semver.
function matchesVersionRange(version, range) {
  const actual = versionParts(version);
  if (!range || !actual) return false;
  const bounds = range.split(" || ").map((part) => part.match(/^>=(\d+(?:\.\d+){0,2})\s+<(\d+(?:\.\d+){0,2})$/));
  if (bounds.some((match) => !match)) return false;
  return bounds.some((match) =>
    compareVersions(actual, versionParts(match[1])) >= 0
    && compareVersions(actual, versionParts(match[2])) < 0);
}

const mismatches = Object.entries(requirements)
  .filter(([name, range]) => !matchesVersionRange(versions[name], range))
  .map(([name, range]) => `${name} ${versions[name] ?? "unknown"} does not satisfy ${range}`);

if (mismatches.length > 0) {
  console.error("Toolchain mismatch:");
  console.error(mismatches.join("\n"));
  const nodeMismatch = !matchesVersionRange(versions.node, requirements.node);
  if (nodeMismatch) {
    const nodeMajors = [...requirements.node.matchAll(/>=(\d+)/g)].map((match) => match[1]).reverse();
    console.error("Select a Node.js version satisfying %s.", requirements.node);
    console.error("For nvm users, choose one supported line for this shell/project:");
    for (const major of nodeMajors) console.error("  nvm install %s && nvm use %s", major, major);
  }
  if (!versions.npm) {
    console.error("npm version is unknown because npm's user-agent was not provided; run the check through npm.");
  }
  console.error("Recheck with:\n  npm run verify:toolchain");
  if (versions.npm && !matchesVersionRange(versions.npm, requirements.npm)) {
    console.error(nodeMismatch
      ? `If npm still does not satisfy ${requirements.npm} after selecting Node.js, run:`
      : `To select the repository's declared npm version (${requirements.npm}), run:`);
    console.error("  npm install --global %s\n  npm run verify:toolchain", packageJson.packageManager);
  }
  process.exitCode = 1;
} else {
  console.log("Toolchain OK", { node: versions.node, npm: versions.npm });
}
