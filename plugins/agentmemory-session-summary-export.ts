export const CURRENT_SESSION_SUMMARY_EXPORT_TOOL_NAME = "export-session-summary";

export interface SessionSummaryExportSessionIdentity {
  readonly sessionId: string;
  readonly title: string | null;
}

export interface DeterministicSessionAnchorMaterial {
  readonly sessionId: string;
  readonly source: "deterministic-session-anchor";
  readonly markdown: string;
  readonly unresolvedFailuresMarkdown: string | null;
}

export interface AgentMemoryNarrativeSummaryMaterial {
  readonly sessionId: string;
  readonly source: "agentmemory-narrative-summary";
  readonly markdown: string;
}

export interface SessionAwareNarrativeSummaryUnavailable {
  readonly sessionId: string;
  readonly source: "agentmemory-narrative-summary-unavailable";
  readonly reason: "empty-context" | "http-error" | "transport-error";
}

export type SessionAwareNarrativeSummaryResult =
  | Readonly<AgentMemoryNarrativeSummaryMaterial>
  | Readonly<SessionAwareNarrativeSummaryUnavailable>
  | null;

export interface SessionAwareNarrativeContextProvider {
  getNarrativeSummaryForSession(sessionId: string): Promise<SessionAwareNarrativeSummaryResult>;
}

export interface CurrentSessionSummaryExportSessionProvider {
  getCurrentSession(): Promise<Readonly<SessionSummaryExportSessionIdentity>>;
}

export interface SessionLocalDeterministicAnchorProvider {
  getDeterministicAnchorForSession(sessionId: string): Promise<Readonly<DeterministicSessionAnchorMaterial>>;
}

export interface ExplicitVerificationEvidenceMaterial {
  readonly source: "explicit-verification-evidence";
  readonly markdown: string;
}

export interface SessionVerificationEvidenceProvider {
  getVerificationEvidenceForSession(
    sessionId: string,
  ): Promise<Readonly<ExplicitVerificationEvidenceMaterial> | null>;
}

export interface SessionSummaryExportReportInput {
  readonly session: Readonly<SessionSummaryExportSessionIdentity>;
  readonly deterministicAnchor: Readonly<DeterministicSessionAnchorMaterial>;
  readonly narrativeSummary?: Readonly<AgentMemoryNarrativeSummaryMaterial> | null;
  readonly narrativeSummaryUnavailable?: Readonly<SessionAwareNarrativeSummaryUnavailable> | null;
  readonly verificationEvidence?: Readonly<ExplicitVerificationEvidenceMaterial> | null;
}

export interface CurrentSessionSummaryExportReportRequest {
  readonly currentSessionProvider: Readonly<CurrentSessionSummaryExportSessionProvider>;
  readonly deterministicAnchorProvider: Readonly<SessionLocalDeterministicAnchorProvider>;
  readonly narrativeContextProvider: Readonly<SessionAwareNarrativeContextProvider>;
  readonly verificationEvidenceProvider?: Readonly<SessionVerificationEvidenceProvider> | null;
}

export interface CurrentSessionSummaryExportChatResult {
  readonly destination: "chat";
  readonly wroteFiles: false;
  readonly report: Readonly<SessionSummaryExportReportInput>;
  readonly markdown: string;
}

export interface CurrentSessionSummaryExportHandler {
  exportCurrentSessionSummaryToChat(): Promise<Readonly<CurrentSessionSummaryExportChatResult>>;
}

export interface CurrentSessionSummaryExportToolMetadata {
  readonly destination: CurrentSessionSummaryExportChatResult["destination"];
  readonly wroteFiles: CurrentSessionSummaryExportChatResult["wroteFiles"];
  readonly sessionId: SessionSummaryExportSessionIdentity["sessionId"];
}

export interface CurrentSessionSummaryExportToolResult {
  readonly title: "Current Session Summary";
  readonly output: CurrentSessionSummaryExportChatResult["markdown"];
  readonly metadata: Readonly<CurrentSessionSummaryExportToolMetadata>;
}

export interface CurrentSessionSummaryExportToolDefinition {
  execute(
    args: Readonly<Record<string, never>>,
    context: Readonly<{ sessionID: string }>,
  ): Promise<Readonly<CurrentSessionSummaryExportToolResult>>;
}

function getNarrativeUnavailableMessage(reason: SessionAwareNarrativeSummaryUnavailable["reason"]): string {
  if (reason === "http-error") {
    return "AgentMemory narrative summary was unavailable because the service returned an error.";
  }
  if (reason === "transport-error") {
    return "AgentMemory narrative summary was unavailable because the service could not be reached.";
  }
  return "AgentMemory narrative summary was unavailable for this session.";
}

export function createCurrentSessionSummaryExportHandler(
  request: Readonly<CurrentSessionSummaryExportReportRequest>,
): Readonly<CurrentSessionSummaryExportHandler> {
  return {
    exportCurrentSessionSummaryToChat: () => exportCurrentSessionSummaryToChat(request),
  };
}

export function createCurrentSessionSummaryExportToolDefinition(
  request: Readonly<CurrentSessionSummaryExportReportRequest>,
): Readonly<CurrentSessionSummaryExportToolDefinition> {
  return {
    async execute(): Promise<Readonly<CurrentSessionSummaryExportToolResult>> {
      const result = await exportCurrentSessionSummaryToChat(request);
      return {
        title: "Current Session Summary",
        output: result.markdown,
        metadata: {
          destination: result.destination,
          wroteFiles: result.wroteFiles,
          sessionId: result.report.session.sessionId,
        },
      };
    },
  };
}

export async function buildCurrentSessionSummaryExportReport(
  request: Readonly<CurrentSessionSummaryExportReportRequest>,
): Promise<Readonly<SessionSummaryExportReportInput>> {
  const session = await request.currentSessionProvider.getCurrentSession();
  const deterministicAnchor = await request.deterministicAnchorProvider.getDeterministicAnchorForSession(
    session.sessionId,
  );
  const narrativeSummaryResult = await request.narrativeContextProvider.getNarrativeSummaryForSession(session.sessionId);

  const report: {
    session: Readonly<SessionSummaryExportSessionIdentity>;
    deterministicAnchor: Readonly<DeterministicSessionAnchorMaterial>;
    narrativeSummary?: Readonly<AgentMemoryNarrativeSummaryMaterial> | null;
    narrativeSummaryUnavailable?: Readonly<SessionAwareNarrativeSummaryUnavailable> | null;
    verificationEvidence?: Readonly<ExplicitVerificationEvidenceMaterial> | null;
  } = {
    session,
    deterministicAnchor,
  };

  if (narrativeSummaryResult?.source === "agentmemory-narrative-summary") {
    report.narrativeSummary = narrativeSummaryResult;
  } else if (narrativeSummaryResult?.source === "agentmemory-narrative-summary-unavailable") {
    report.narrativeSummaryUnavailable = narrativeSummaryResult;
  }

  if (request.verificationEvidenceProvider) {
    const verificationEvidence = await request.verificationEvidenceProvider.getVerificationEvidenceForSession(session.sessionId);
    if (verificationEvidence) {
      report.verificationEvidence = verificationEvidence;
    }
  }

  return report;
}

export async function exportCurrentSessionSummaryToChat(
  request: Readonly<CurrentSessionSummaryExportReportRequest>,
): Promise<Readonly<CurrentSessionSummaryExportChatResult>> {
  const report = await buildCurrentSessionSummaryExportReport(request);
  return {
    destination: "chat",
    wroteFiles: false,
    report,
    markdown: buildSessionSummaryExportMarkdown(report),
  };
}

export function buildSessionSummaryExportMarkdown(
  input: Readonly<SessionSummaryExportReportInput>,
): string {
  const lines: string[] = [];

  lines.push("## Session Summary Export");
  lines.push(`Session: ${input.session.sessionId}`);
  if (input.session.title) {
    lines.push(`Session Title: ${input.session.title}`);
  }

  if (input.deterministicAnchor.markdown.trim().length > 0) {
    lines.push("", "## Deterministic Session Anchor");
    lines.push(input.deterministicAnchor.markdown);
  } else {
    lines.push("", "No trusted session-local deterministic evidence is available for this session.");
  }

  if (input.deterministicAnchor.unresolvedFailuresMarkdown) {
    lines.push("", "## Unresolved Failures");
    lines.push(input.deterministicAnchor.unresolvedFailuresMarkdown);
  }

  if (input.narrativeSummary) {
    lines.push("", "## Summary Material");
    lines.push("AgentMemory narrative summary (not ground truth):");
    lines.push(input.narrativeSummary.markdown);
  } else if (input.narrativeSummaryUnavailable) {
    lines.push("", "## Summary Material");
    lines.push("AgentMemory narrative summary (not ground truth):");
    lines.push(getNarrativeUnavailableMessage(input.narrativeSummaryUnavailable.reason));
  }

  if (input.verificationEvidence) {
    lines.push("", "## Explicit Verification Evidence");
    lines.push(input.verificationEvidence.markdown);
  } else {
    lines.push("", "## Verification");
    lines.push("This report is not an independently verified build/test result.");
  }

  return lines.join("\n");
}
