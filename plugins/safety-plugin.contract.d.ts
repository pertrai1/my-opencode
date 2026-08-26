import type { Event } from "@opencode-ai/sdk";

export type SafetyPluginTrackedSessionEvent = Extract<
  Event,
  { type: "session.created" | "session.updated" | "session.deleted" }
>;

export interface SafetyPluginUnhandledEvent {
  type: string;
  properties?: Record<string, unknown>;
}

export type SafetyPluginEvent = SafetyPluginTrackedSessionEvent | SafetyPluginUnhandledEvent;

export interface SafetyPluginInput {
  directory: string;
}

export type SafetyPluginOptions = Readonly<Record<string, unknown>>;

export interface SafetyPluginChatMessageInput {
  sessionID: string;
  agent?: string;
}

export interface SafetyPluginChatMessageOutput {
  message: unknown;
  parts: unknown[];
}

export interface SafetyPluginPermissionAskInput {
  sessionID: string;
  type?: string;
  [key: string]: unknown;
}

export interface SafetyPluginPermissionAskOutput {
  status: "ask" | "allow" | "deny";
}

export interface SafetyPluginToolExecuteBeforeInput {
  tool: string;
  sessionID: string;
  callID: string;
}

export interface SafetyPluginReadArgs {
  filePath: string;
  [key: string]: unknown;
}

export interface SafetyPluginCommandArgs {
  command: string;
  [key: string]: unknown;
}

export interface SafetyPluginGenericArgs {
  [key: string]: unknown;
}

export interface SafetyPluginReadToolExecuteBeforeInput extends SafetyPluginToolExecuteBeforeInput {
  tool: "read";
}

export interface SafetyPluginReadToolExecuteBeforeOutput {
  args: SafetyPluginReadArgs;
}

export interface SafetyPluginCommandToolExecuteBeforeInput extends SafetyPluginToolExecuteBeforeInput {
  tool: "bash" | "shell";
}

export interface SafetyPluginCommandToolExecuteBeforeOutput {
  args: SafetyPluginCommandArgs;
}

export interface SafetyPluginGenericToolExecuteBeforeOutput {
  args: SafetyPluginGenericArgs;
}

export interface SafetyPluginToolExecuteBeforeHook {
  (
    input: SafetyPluginReadToolExecuteBeforeInput,
    output: SafetyPluginReadToolExecuteBeforeOutput,
  ): Promise<void>;
  (
    input: SafetyPluginCommandToolExecuteBeforeInput,
    output: SafetyPluginCommandToolExecuteBeforeOutput,
  ): Promise<void>;
  (
    input: SafetyPluginToolExecuteBeforeInput,
    output: SafetyPluginGenericToolExecuteBeforeOutput,
  ): Promise<void>;
}

export interface SafetyPluginHooks {
  "chat.message": (
    input: SafetyPluginChatMessageInput,
    output?: SafetyPluginChatMessageOutput,
  ) => Promise<void>;
  event: (input: { event: SafetyPluginEvent }) => Promise<void>;
  "permission.ask": (
    input: SafetyPluginPermissionAskInput,
    output: SafetyPluginPermissionAskOutput,
  ) => Promise<void>;
  "tool.execute.before": SafetyPluginToolExecuteBeforeHook;
}

export interface SafetyPluginFactory {
  (input: SafetyPluginInput, options?: SafetyPluginOptions): Promise<SafetyPluginHooks>;
}

export declare const SafetyPlugin: SafetyPluginFactory;

export default SafetyPlugin;
