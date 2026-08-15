import type { Hooks } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk";

export interface SessionCompactionAnchorLimits {
  readonly maxUserRequests: number;
  readonly maxToolCompletions: number;
  readonly maxToolFailures: number;
  readonly maxPatchEntries: number;
  readonly maxSessionDiffEntries: number;
  readonly maxSessionErrors: number;
  readonly maxFilesPerMetadataEntry: number;
  readonly maxUserRequestChars: number;
  readonly maxToolInputChars: number;
  readonly maxToolOutputChars: number;
  readonly maxErrorChars: number;
  readonly maxRenderedChars: number;
}

export interface BaseSessionCompactionAnchorEvidence {
  readonly sessionId: string;
}

export interface UserIntentAnchorEvidence extends BaseSessionCompactionAnchorEvidence {
  readonly kind: "user-intent";
  readonly text: string;
}

export interface ObservedToolCompletionAnchorEvidence extends BaseSessionCompactionAnchorEvidence {
  readonly kind: "tool-completion";
  readonly toolName: string;
  readonly callId: string;
  readonly title: string | null;
  readonly inputExcerpt: string;
  readonly outputExcerpt: string;
  readonly durationMs: number | null;
}

export interface ObservedToolFailureAnchorEvidence extends BaseSessionCompactionAnchorEvidence {
  readonly kind: "tool-failure";
  readonly toolName: string;
  readonly callId: string;
  readonly inputExcerpt: string;
  readonly errorExcerpt: string;
  readonly durationMs: number | null;
}

export interface PatchMetadataAnchorEvidence extends BaseSessionCompactionAnchorEvidence {
  readonly kind: "patch-metadata";
  readonly hash: string;
  readonly files: readonly string[];
}

export interface SessionDiffMetadataAnchorEvidence extends BaseSessionCompactionAnchorEvidence {
  readonly kind: "session-diff";
  readonly files: readonly string[];
  readonly additions: number;
  readonly deletions: number;
}

export interface SessionErrorAnchorEvidence extends BaseSessionCompactionAnchorEvidence {
  readonly kind: "session-error";
  readonly errorExcerpt: string;
}

export type SessionCompactionAnchorEvidence =
  | UserIntentAnchorEvidence
  | ObservedToolCompletionAnchorEvidence
  | ObservedToolFailureAnchorEvidence
  | PatchMetadataAnchorEvidence
  | SessionDiffMetadataAnchorEvidence
  | SessionErrorAnchorEvidence;

export type SessionCompactionAnchorChatMessageInput = Parameters<NonNullable<Hooks["chat.message"]>>[0];
export type SessionCompactionAnchorChatMessageOutput = Parameters<NonNullable<Hooks["chat.message"]>>[1];
export type SessionCompactionAnchorCompactingOutput = Parameters<NonNullable<Hooks["experimental.session.compacting"]>>[1];

export interface SessionCompactionAnchorStore {
  readonly limits: Readonly<SessionCompactionAnchorLimits>;

  getEvidence(sessionId: string): readonly SessionCompactionAnchorEvidence[];
}

export declare const DEFAULT_SESSION_COMPACTION_ANCHOR_LIMITS: Readonly<SessionCompactionAnchorLimits>;

export declare function createSessionCompactionAnchorStore(
  limits?: Partial<SessionCompactionAnchorLimits>,
): SessionCompactionAnchorStore;

export declare function captureSessionCompactionAnchorChatMessage(
  store: SessionCompactionAnchorStore,
  input: SessionCompactionAnchorChatMessageInput,
  output: SessionCompactionAnchorChatMessageOutput,
): void;

export declare function captureSessionCompactionAnchorEvent(
  store: SessionCompactionAnchorStore,
  event: Event,
): void;

export declare function renderSessionCompactionAnchor(
  store: SessionCompactionAnchorStore,
  sessionId: string,
): string | null;

export declare function injectSessionCompactionAnchor(
  store: SessionCompactionAnchorStore,
  sessionId: string,
  output: SessionCompactionAnchorCompactingOutput,
): boolean;

export declare function clearSessionCompactionAnchorSession(
  store: SessionCompactionAnchorStore,
  sessionId: string,
): void;
