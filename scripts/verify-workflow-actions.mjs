import { verifyWorkflowActions } from "./verify-workflow-actions-lib.mjs";

try {
  const { violations } = await verifyWorkflowActions();
  if (violations.length > 0) {
    console.error("Workflow action references must use a full commit SHA and a release comment:");
    console.error(violations.map(({ file, line, text }) => `${file}:${line}: ${text}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log("All third-party workflow actions use full commit SHAs with release comments.");
  }
} catch (error) {
  console.error("Unable to read workflow directory", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}
