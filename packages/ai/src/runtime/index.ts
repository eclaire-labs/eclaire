/**
 * Runtime Exports
 *
 * The new runtime module provides richer message types, tool definitions,
 * skill support, and the convert-to-LLM boundary.
 */

// Message model
export type {
  TextBlock,
  ThinkingBlock,
  ToolCallBlock,
  ImageBlock,
  AssistantContentBlock,
  UserContentBlock,
  ResultContentBlock,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  SystemMessage,
  RuntimeMessage,
  AnyRuntimeMessage,
  StopReason,
  RuntimeStreamEvent,
  ToolProgressUpdate,
} from "./messages.js";

export {
  getTextContent,
  getToolCalls,
  getThinkingContent,
  userMessage,
  systemMessage,
} from "./messages.js";

// Tool types
export type {
  RuntimeToolDefinition,
  RuntimeToolResult,
  ToolResultContent,
  ToolContext,
  ToolUpdateCallback,
  ToolProgressInfo,
} from "./tools/index.js";

export { textResult, errorResult } from "./tools/index.js";

// Skill types
export type {
  Skill,
  SkillFrontmatter,
  SkillScope,
  SkillSource,
} from "./skills/index.js";

// Agent
export { RuntimeAgent } from "./agent/index.js";
export { convertToLlm, convertFromLlm } from "./agent/index.js";
export { runtimeToolToOpenAI, executeRuntimeTool } from "./agent/index.js";
export { createRuntimeContext } from "./agent/index.js";
export { wrapLegacyTool, wrapLegacyTools } from "./agent/index.js";

export type {
  RuntimeAgentConfig,
  RuntimeAgentContext,
  RuntimeAgentResult,
  RuntimeAgentStep,
  RuntimeGenerateOptions,
  RuntimeStepToolExecution,
  RuntimeStreamResult,
  CreateRuntimeContextOptions,
} from "./agent/index.js";
