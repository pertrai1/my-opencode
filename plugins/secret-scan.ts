import * as path from "node:path";

import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk";

const MAX_FINDINGS_PER_SCAN = 20;
const MAX_FINDINGS_PER_TOAST = 5;
const MIN_REPO_SCAN_INTERVAL_MS = 30_000;

type GitleaksFinding = {
  Description?: unknown;
  File?: unknown;
  StartLine?: unknown;
  RuleID?: unknown;
  Fingerprint?: unknown;
};

type SecretFinding = {
  description: string;
  filePath: string;
  fingerprint: string | null;
  line: number | null;
  ruleId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseGitleaksReport(reportText: string): SecretFinding[] {
  const trimmed = reportText.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const parsed: unknown = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((finding): finding is GitleaksFinding => isRecord(finding))
    .map((finding) => ({
      description: getString(finding.Description) ?? "secret detected",
      filePath: getString(finding.File) ?? "unknown",
      fingerprint: getString(finding.Fingerprint),
      line: getNumber(finding.StartLine),
      ruleId: getString(finding.RuleID) ?? "unknown-rule",
    }));
}

function hasGitleaksFindings(reportText: string): boolean {
  return parseGitleaksReport(reportText).length > 0;
}

function summarizeFindings(findings: SecretFinding[]): string[] {
  return findings.map((finding) => {
    const location =
      finding.line !== null
        ? `${finding.filePath}:${finding.line}`
        : finding.filePath;
    return `${location} ${finding.ruleId} (${finding.description})`;
  });
}

function extractEditedFilePath(event: Event, rootDir: string): string | null {
  const properties = isRecord((event as { properties?: unknown }).properties)
    ? (event as { properties: Record<string, unknown> }).properties
    : null;
  if (!properties) {
    return null;
  }

  const candidates = [
    properties.path,
    properties.filePath,
    properties.file,
    properties.filename,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.length === 0) {
      continue;
    }

    return path.isAbsolute(candidate)
      ? candidate
      : path.join(rootDir, candidate);
  }

  return null;
}

function buildScanArgs(targetPath: string): string[] {
  return [
    "gitleaks",
    "dir",
    targetPath,
    "--no-banner",
    "--redact",
    "--report-format",
    "json",
    "--report-path",
    "-",
  ];
}

async function filterIgnoredFindings(
  findings: SecretFinding[],
  isIgnored: (filePath: string) => Promise<boolean>,
): Promise<SecretFinding[]> {
  const kept: SecretFinding[] = [];

  for (const finding of findings) {
    if (await isIgnored(finding.filePath)) {
      continue;
    }
    kept.push(finding);
  }

  return kept;
}

function buildToastMessage(findings: SecretFinding[]): string {
  const lines = summarizeFindings(findings.slice(0, MAX_FINDINGS_PER_TOAST));
  if (findings.length <= MAX_FINDINGS_PER_TOAST) {
    return lines.join("\n");
  }

  return `${lines.join("\n")}\n+${findings.length - MAX_FINDINGS_PER_TOAST} more`;
}

type SecretScanPluginWithTestUtils = Plugin & {
  testUtils: {
    buildScanArgs: typeof buildScanArgs;
    buildToastMessage: typeof buildToastMessage;
    filterIgnoredFindings: typeof filterIgnoredFindings;
    hasGitleaksFindings: typeof hasGitleaksFindings;
    parseGitleaksReport: typeof parseGitleaksReport;
  };
};

const SecretScanPlugin: SecretScanPluginWithTestUtils = async ({
  $,
  client,
  directory,
  worktree,
}: PluginInput): Promise<Hooks> => {
  const rootDir = worktree ?? directory;
  const reportedFindings = new Set<string>();
  const gitleaksProbe = await $`which gitleaks`.quiet().nothrow();
  const gitleaksAvailable = gitleaksProbe.exitCode === 0;
  let notifiedMissingBinary = false;
  let lastRepoScanAt = 0;

  const showToast = async (
    title: string,
    message: string,
    variant: "warning" | "error",
  ): Promise<void> => {
    await client.tui.showToast({
      body: {
        title,
        message,
        variant,
        duration: variant === "error" ? 10000 : 8000,
      },
    });
  };

  const notifyUnavailable = async (): Promise<void> => {
    if (notifiedMissingBinary || gitleaksAvailable) {
      return;
    }
    notifiedMissingBinary = true;
    await showToast(
      "Secret scan disabled",
      "gitleaks was not found in PATH.",
      "warning",
    );
  };

  const isGitIgnored = async (targetPath: string): Promise<boolean> => {
    const absolutePath = path.isAbsolute(targetPath)
      ? targetPath
      : path.join(rootDir, targetPath);
    const result = await $`git check-ignore --no-index --quiet ${absolutePath}`
      .cwd(rootDir)
      .quiet()
      .nothrow();
    return result.exitCode === 0;
  };

  const runScan = async (targetPath: string): Promise<SecretFinding[]> => {
    if (!gitleaksAvailable) {
      return [];
    }

    const result = await $`${buildScanArgs(targetPath)}`.quiet().nothrow();
    const stdout = String(result.stdout ?? "");
    const stderr = String(result.stderr ?? "");
    const parsedFindings = parseGitleaksReport(stdout).slice(
      0,
      MAX_FINDINGS_PER_SCAN,
    );
    const findings = await filterIgnoredFindings(parsedFindings, isGitIgnored);

    if (findings.length > 0) {
      return findings;
    }

    if (parsedFindings.length > 0) {
      return [];
    }

    if (result.exitCode === 0) {
      return [];
    }

    if (stderr.trim().length > 0) {
      await showToast("Secret scan failed", stderr.trim(), "error");
    }

    return [];
  };

  const reportFindings = async (findings: SecretFinding[]): Promise<void> => {
    const unseen = findings.filter((finding) => {
      const key =
        finding.fingerprint ??
        `${finding.filePath}:${finding.line ?? "unknown"}:${finding.ruleId}`;
      if (reportedFindings.has(key)) {
        return false;
      }
      reportedFindings.add(key);
      return true;
    });

    if (unseen.length === 0) {
      return;
    }

    await showToast(
      "Potential secrets detected",
      buildToastMessage(unseen),
      "warning",
    );
  };

  const scanRepo = async (): Promise<void> => {
    lastRepoScanAt = Date.now();
    await reportFindings(await runScan(rootDir));
  };

  const scanEditedFile = async (event: Event): Promise<void> => {
    const editedFilePath = extractEditedFilePath(event, rootDir);
    if (editedFilePath) {
      if (await isGitIgnored(editedFilePath)) {
        return;
      }

      await reportFindings(await runScan(editedFilePath));
      return;
    }

    if (Date.now() - lastRepoScanAt >= MIN_REPO_SCAN_INTERVAL_MS) {
      await scanRepo();
    }
  };

  return {
    event: async ({ event }: { event: Event }) => {
      if (!gitleaksAvailable) {
        if (event.type === "session.created") {
          await notifyUnavailable();
        }
        return;
      }

      if (event.type === "session.created") {
        await scanRepo();
        return;
      }

      if (event.type === "file.edited") {
        await scanEditedFile(event);
      }
    },
  };
};

SecretScanPlugin.testUtils = {
  buildScanArgs,
  buildToastMessage,
  filterIgnoredFindings,
  hasGitleaksFindings,
  parseGitleaksReport,
};

export default SecretScanPlugin;
