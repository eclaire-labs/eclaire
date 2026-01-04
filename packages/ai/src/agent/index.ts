/**
 * Agent Module
 *
 * ToolLoopAgent implementation inspired by AI SDK v6 patterns.
 * Provides a clean, composable architecture for multi-step AI tool calling.
 *
 * @example
 * ```typescript
 * import {
 *   ToolLoopAgent,
 *   tool,
 *   createAgentContext,
 *   stepCountIs,
 *   noToolCalls,
 *   anyOf,
 * } from "@eclaire/ai/agent";
 * import { z } from "zod";
 *
 * // Define a tool
 * const findNotesTool = tool({
 *   name: "findNotes",
 *   description: "Search notes by text and tags",
 *   inputSchema: z.object({
 *     text: z.string().optional(),
 *     tags: z.array(z.string()).optional(),
 *   }),
 *   execute: async (input, context) => {
 *     const results = await searchNotes(context.userId, input);
 *     return { success: true, content: JSON.stringify(results) };
 *   },
 * });
 *
 * // Create agent
 * const agent = new ToolLoopAgent({
 *   aiContext: "backend",
 *   instructions: "You are a helpful assistant.",
 *   tools: { findNotes: findNotesTool },
 *   stopWhen: anyOf(stepCountIs(10), noToolCalls()),
 * });
 *
 * // Execute
 * const context = createAgentContext({ userId: "user_123" });
 * const result = await agent.generate({ prompt: "Find my notes", context });
 * console.log(result.text);
 * ```
 */

// =============================================================================
// MAIN CLASSES
// =============================================================================

export { ToolLoopAgent } from "./tool-loop-agent.js";

// =============================================================================
// CONTEXT
// =============================================================================

export {
  createAgentContext,
  isContextAborted,
  getContextElapsedMs,
  extendContext,
} from "./context.js";

// =============================================================================
// TOOL HELPERS
// =============================================================================

export {
  tool,
  toOpenAIToolDefinition,
  toOpenAITools,
  executeAgentTool,
} from "./tool.js";

// =============================================================================
// STOP CONDITIONS
// =============================================================================

export {
  stepCountIs,
  hasToolCall,
  noToolCalls,
  finishReasonStop,
  anyOf,
  allOf,
  custom,
  maxTokens,
  maxDuration,
  evaluateStopConditions,
  defaultStopConditions,
} from "./stop-conditions.js";

// =============================================================================
// TYPES
// =============================================================================

export type {
  // Context types
  AgentContext,
  CreateContextOptions,
  // Tool types
  AgentToolDefinition,
  AnyZodType,
  // Stop condition types
  StopCondition,
  // Step types
  StepToolExecution,
  AgentStep,
  // Config types
  PrepareStepInfo,
  PrepareStepResult,
  ToolLoopAgentConfig,
  // Result types
  AgentResult,
  AgentStreamEvent,
  AgentStreamResult,
  GenerateOptions,
} from "./types.js";
