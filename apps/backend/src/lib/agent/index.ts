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
  ConversationNotFoundError,
  loadConversation,
  loadConversationMessages,
  type SaveConversationOptions,
  saveConversationMessages,
} from "./conversation-adapter.js";
// Main service functions
export {
  createBackendAgent,
  type ProcessPromptOptions,
  type PromptResponse,
  processPromptRequest,
  processPromptRequestStream,
  type StreamEvent,
  transformRuntimeEvent,
} from "./prompt-service.js";
// System prompt building
export {
  type AssetContent,
  type BuildSystemPromptOptions,
  buildSystemPrompt,
} from "./system-prompt-builder.js";
// Types
export type { UserContext } from "./types.js";
