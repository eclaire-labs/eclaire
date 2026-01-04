/**
 * Backend Agent Module
 *
 * Exports all agent-related functionality for the backend.
 */

// Main service functions
export {
  processPromptRequest,
  processPromptRequestStream,
  ConversationNotFoundError,
  type ProcessPromptOptions,
  type PromptResponse,
  type StreamEvent,
} from "./prompt-service.js";

// Tools
export { backendTools } from "./tools/index.js";

// System prompt building
export {
  buildSystemPrompt,
  type BuildSystemPromptOptions,
  type AssetContent,
} from "./system-prompt-builder.js";

// Asset fetching
export {
  fetchAssetContent,
  fetchAssetContents,
} from "./asset-fetcher.js";

// Conversation handling
export {
  loadConversation,
  loadConversationMessages,
  saveConversationMessages,
  type SaveConversationOptions,
} from "./conversation-adapter.js";

// Types
export type { BackendAgentContext, UserContext } from "./types.js";
