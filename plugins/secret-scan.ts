import * as path from "node:path";

import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk";

const MAX_FINDINGS_PER_SCAN = 20;
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

function summarizeFindings(findings: SecretFinding[]): string[] {
  return findings.map((finding) => {
    const location = finding.line !== null ? `${finding.filePath}:${finding.line}` : finding.filePath;
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

  const candidates = [properties.path, properties.filePath, properties.file, properties.filename];
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

export { buildScanArgs, parseGitleaksReport };

export const SecretScanPlugin: Plugin = async ({ $, directory, worktree }: PluginInput): Promise<Hooks> => {
  const rootDir = worktree ?? directory;
  const reportedFindings = new Set<string>();
  const gitleaksProbe = await $`which gitleaks`.quiet().nothrow();
  const gitleaksAvailable = gitleaksProbe.exitCode === 0;
  let warnedMissingBinary = false;
  let lastRepoScanAt = 0;

  const warnUnavailable = (): void => {
    if (warnedMissingBinary || gitleaksAvailable) {
      return;
    }
    warnedMissingBinary = true;
    console.warn("[secret-scan] gitleaks not found in PATH; secret scanning is disabled");
  };

  const runScan = async (targetPath: string): Promise<SecretFinding[]> => {
    if (!gitleaksAvailable) {
      return [];
    }

    const result = await $`${buildScanArgs(targetPath)}`.quiet().nothrow();
    const stdout = String(result.stdout ?? "");
    const stderr = String(result.stderr ?? "");
    const findings = parseGitleaksReport(stdout).slice(0, MAX_FINDINGS_PER_SCAN);

    if (findings.length > 0) {
      return findings;
    }

    if (result.exitCode === 0) {
      return [];
    }

    if (stderr.trim().length > 0) {
      console.warn("[secret-scan] gitleaks scan failed", { message: stderr.trim() });
    }

    return [];
  };

  const reportFindings = (findings: SecretFinding[]): void => {
    const unseen = findings.filter((finding) => {
      const key = finding.fingerprint ?? `${finding.filePath}:${finding.line ?? "unknown"}:${finding.ruleId}`;
      if (reportedFindings.has(key)) {
        return false;
      }
      reportedFindings.add(key);
      return true;
    });

    if (unseen.length === 0) {
      return;
    }

    console.warn("[secret-scan] Potential committed secrets detected", {
      count: unseen.length,
      findings: summarizeFindings(unseen),
    });
  };

  const scanRepo = async (): Promise<void> => {
    lastRepoScanAt = Date.now();
    reportFindings(await runScan(rootDir));
  };

  const scanEditedFile = async (event: Event): Promise<void> => {
    const editedFilePath = extractEditedFilePath(event, rootDir);
    if (editedFilePath) {
      reportFindings(await runScan(editedFilePath));
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
          warnUnavailable();
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

export default SecretScanPlugin;
