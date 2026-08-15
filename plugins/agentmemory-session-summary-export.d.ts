import type { ToolContext } from "@opencode-ai/plugin";

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

export declare function createCurrentSessionSummaryExportHandler(
  request: Readonly<CurrentSessionSummaryExportReportRequest>,
): Readonly<CurrentSessionSummaryExportHandler>;

export declare function buildCurrentSessionSummaryExportReport(
  request: Readonly<CurrentSessionSummaryExportReportRequest>,
): Promise<Readonly<SessionSummaryExportReportInput>>;

export declare function exportCurrentSessionSummaryToChat(
  request: Readonly<CurrentSessionSummaryExportReportRequest>,
): Promise<Readonly<CurrentSessionSummaryExportChatResult>>;

export declare function buildSessionSummaryExportMarkdown(
  input: Readonly<SessionSummaryExportReportInput>,
): string;

export declare const CURRENT_SESSION_SUMMARY_EXPORT_TOOL_NAME: "export-session-summary";

export declare function createCurrentSessionSummaryExportToolDefinition(
  request: Readonly<CurrentSessionSummaryExportReportRequest>,
): Readonly<CurrentSessionSummaryExportToolDefinition>;

export type CurrentSessionSummaryExportToolArgs = Readonly<Record<string, never>>;

export type CurrentSessionSummaryExportToolContext = Pick<ToolContext, "sessionID">;

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
    args: Readonly<CurrentSessionSummaryExportToolArgs>,
    context: Readonly<CurrentSessionSummaryExportToolContext>,
  ): Promise<Readonly<CurrentSessionSummaryExportToolResult>>;
}
