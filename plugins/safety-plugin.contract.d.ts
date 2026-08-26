import type { PluginInput } from "@opencode-ai/plugin";
import type { Event, Part, Permission, UserMessage } from "@opencode-ai/sdk";

export type SafetyPluginEvent = Event;

export type SafetyPluginInput = PluginInput;

export interface SafetyPluginTruncationOptions {
  maxLength?: number;
  headLength?: number;
  tailLength?: number;
  tempDir?: string;
  retentionHours?: number;
  maxTempDirSizeMB?: number;
}

export interface SafetyPluginDoomLoopOptions {
  enabled?: boolean;
  bufferSize?: number;
  maxRepetitions?: number;
  exemptTools?: string[];
}

export interface SafetyPluginOptions {
  truncation?: SafetyPluginTruncationOptions;
  doomLoop?: SafetyPluginDoomLoopOptions;
}

export interface SafetyPluginChatMessageModel {
  providerID: string;
  modelID: string;
}

export interface SafetyPluginChatMessageInput {
  sessionID: string;
  agent?: string;
  model?: SafetyPluginChatMessageModel;
  messageID?: string;
  variant?: string;
}

export interface SafetyPluginChatMessageOutput {
  message: UserMessage;
  parts: Part[];
}

export type SafetyPluginPermissionAskInput = Permission;

export interface SafetyPluginPermissionAskOutput {
  status: "ask" | "allow" | "deny";
}

export interface SafetyPluginToolExecuteBeforeInput {
  tool: string;
  sessionID: string;
  callID: string;
}

export interface SafetyPluginGenericArgs {
  [key: string]: unknown;
}

export interface SafetyPluginReadArgs extends SafetyPluginGenericArgs {
  filePath?: string;
  path?: string;
}

export interface SafetyPluginCommandArgs extends SafetyPluginGenericArgs {
  command: string;
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

export interface SafetyPluginToolExecuteAfterInput {
  tool: string;
  sessionID: string;
  callID: string;
  args: SafetyPluginGenericArgs;
}

export interface SafetyPluginReadToolExecuteAfterInput extends SafetyPluginToolExecuteAfterInput {
  tool: "read";
  args: SafetyPluginReadArgs;
}

export interface SafetyPluginCommandToolExecuteAfterInput extends SafetyPluginToolExecuteAfterInput {
  tool: "bash" | "shell";
  args: SafetyPluginCommandArgs;
}

export interface SafetyPluginToolExecuteAfterOutput {
  title: string;
  output: string;
  metadata: unknown;
}

export interface SafetyPluginToolExecuteAfterHook {
  (
    input: SafetyPluginReadToolExecuteAfterInput,
    output: SafetyPluginToolExecuteAfterOutput,
  ): Promise<void>;
  (
    input: SafetyPluginCommandToolExecuteAfterInput,
    output: SafetyPluginToolExecuteAfterOutput,
  ): Promise<void>;
  (
    input: SafetyPluginToolExecuteAfterInput,
    output: SafetyPluginToolExecuteAfterOutput,
  ): Promise<void>;
}

export interface SafetyPluginHooks {
  dispose: () => Promise<void>;
  "chat.message": (
    input: SafetyPluginChatMessageInput,
    output: SafetyPluginChatMessageOutput,
  ) => Promise<void>;
  event: (input: { event: SafetyPluginEvent }) => Promise<void>;
  "permission.ask": (
    input: SafetyPluginPermissionAskInput,
    output: SafetyPluginPermissionAskOutput,
  ) => Promise<void>;
  "tool.execute.before": SafetyPluginToolExecuteBeforeHook;
  "tool.execute.after": SafetyPluginToolExecuteAfterHook;
}

export interface SafetyPluginFactory {
  (input: SafetyPluginInput, options?: SafetyPluginOptions): Promise<SafetyPluginHooks>;
}

export declare const SafetyPlugin: SafetyPluginFactory;

export default SafetyPlugin;
