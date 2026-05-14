/**
 * Runtime Exports
 *
 * The new runtime module provides richer message types, tool definitions,
 * skill support, and the convert-to-LLM boundary.
 */

// Agent definition types
export type {
  AgentDefinitionBase,
  AgentKind,
  CreateRuntimeContextOptions,
  RuntimeAgentConfig,
  RuntimeAgentContext,
  RuntimeAgentResult,
  RuntimeAgentStep,
  RuntimeGenerateOptions,
  RuntimeStepToolExecution,
  RuntimeStreamResult,
} from "./agent/index.js";
// Agent
// Prompt helpers
export {
  type AppendCapabilitiesOptions,
  appendAgentCapabilities,
  collectToolPromptContributions,
  convertFromLlm,
  convertToLlm,
  createRuntimeContext,
  executeRuntimeTool,
  getToolSignatures,
  RuntimeAgent,
  runtimeToolToOpenAI,
  selectTools,
} from "./agent/index.js";
// Message model
export type {
  AnyRuntimeMessage,
  AssistantContentBlock,
  AssistantMessage,
  ImageBlock,
  ResultContentBlock,
  RuntimeMessage,
  RuntimeStreamEvent,
  StopReason,
  SystemMessage,
  TextBlock,
  ThinkingBlock,
  ToolCallBlock,
  ToolProgressUpdate,
  ToolResultMessage,
  UserContentBlock,
  UserMessage,
} from "./messages.js";
export {
  getTextContent,
  getThinkingContent,
  getToolCalls,
  systemMessage,
  userMessage,
} from "./messages.js";
// Skill types
export type {
  Skill,
  SkillFrontmatter,
  SkillScope,
  SkillSource,
} from "./skills/index.js";
// Tool types
export type {
  ApprovalRequest,
  ApprovalResponse,
  OnApprovalRequired,
  RuntimeToolDefinition,
  RuntimeToolResult,
  ToolContext,
  ToolProgressInfo,
  ToolResultContent,
  ToolUpdateCallback,
} from "./tools/index.js";
export { errorResult, textResult } from "./tools/index.js";
