import { execFileSync } from "node:child_process";

// Hooks export repository-local Git variables. Clear Git's own list before
// loading tests so fixture subprocesses resolve their repositories from cwd.
// https://git-scm.com/docs/githooks#_description
const names = execFileSync("git", ["rev-parse", "--local-env-vars"], {
  encoding: "utf8",
  timeout: 10_000,
}).trim().split(/\s+/);
for (const name of names) delete process.env[name];
