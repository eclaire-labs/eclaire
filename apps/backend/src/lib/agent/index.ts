/**
 * Backend Agent Module
 *
 * Exports all agent-related functionality for the backend.
 */

// Asset fetching
export {
  fetchAssetContent,
  fetchAssetContents,
} from "./asset-fetcher.js";
// Conversation handling
export {
  loadConversation,
  loadConversationMessages,
  type SaveConversationOptions,
  saveConversationMessages,
} from "./conversation-adapter.js";
// Main service functions
export {
  ConversationNotFoundError,
  type ProcessPromptOptions,
  type PromptResponse,
  processPromptRequest,
  processPromptRequestStream,
  type StreamEvent,
} from "./prompt-service.js";
// System prompt building
export {
  type AssetContent,
  type BuildSystemPromptOptions,
  buildSystemPrompt,
} from "./system-prompt-builder.js";
// Tools
export { backendTools } from "./tools/index.js";

// Types
export type { BackendAgentContext, UserContext } from "./types.js";
