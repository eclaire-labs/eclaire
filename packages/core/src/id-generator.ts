import { randomUUID } from "node:crypto";
import { customAlphabet } from "nanoid";

// Clean alphabet without underscores, hyphens, or similar characters
const CLEAN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// Standard length for content entities
const STANDARD_LENGTH = 15;

// Create nanoid generator with clean alphabet
export const generateCleanId = customAlphabet(CLEAN_ALPHABET, STANDARD_LENGTH);

/**
 * ID Generation for Security Entities
 * These entities require cryptographically secure UUIDs
 */
export const generateSecurityId = () => randomUUID();

/**
 * ID Generation for Content Entities
 * These entities use clean nanoid with consistent prefixes
 */
export const generateUserId = () => `user-${generateCleanId()}`;
export const generateActorId = () => `actor-${generateCleanId()}`;
export const generateTaskId = () => `task-${generateCleanId()}`;
export const generateBookmarkId = () => `bm-${generateCleanId()}`;
export const generateDocumentId = () => `doc-${generateCleanId()}`;
export const generatePhotoId = () => `photo-${generateCleanId()}`;
export const generateNoteId = () => `note-${generateCleanId()}`;
export const generateTagId = () => `tag-${generateCleanId()}`;
export const generateHistoryId = () => `hist-${generateCleanId()}`;
export const generateApiKeyId = () => `key-${generateCleanId()}`;
export const generateAssetProcessingJobId = () => `apj-${generateCleanId()}`;
export const generateConversationId = () => `conv-${generateCleanId()}`;
export const generateMessageId = () => `msg-${generateCleanId()}`;
export const generateTaskCommentId = () => `tc-${generateCleanId()}`;
export const generateChannelId = () => `ch-${generateCleanId()}`;
export const generateFeedbackId = () => `fb-${generateCleanId()}`;
export const generateAgentId = () => `agent-${generateCleanId()}`;
export const generateTaskExecutionId = () => `txe-${generateCleanId()}`;
export const generateAgentStepId = () => `step-${generateCleanId()}`;

/**
 * ID Generation for Storage Files
 * These don't use prefixes but include file extensions
 */
export const generateStorageId = (extension?: string) => {
  const id = generateCleanId();
  return extension ? `${id}.${extension}` : id;
};

/**
 * Type guards for ID validation
 */
function createIdValidator(prefix: string): (id: string) => boolean {
  const regex = new RegExp(`^${prefix}-[A-Za-z0-9]{${STANDARD_LENGTH}}$`);
  return (id: string) => regex.test(id);
}

export const isValidUserId = createIdValidator("user");
export const isValidActorId = createIdValidator("actor");
export const isValidTaskId = createIdValidator("task");
export const isValidBookmarkId = createIdValidator("bm");
export const isValidDocumentId = createIdValidator("doc");
export const isValidPhotoId = createIdValidator("photo");
export const isValidNoteId = createIdValidator("note");
export const isValidTagId = createIdValidator("tag");
export const isValidHistoryId = createIdValidator("hist");
export const isValidApiKeyId = createIdValidator("key");
export const isValidConversationId = createIdValidator("conv");
export const isValidMessageId = createIdValidator("msg");
export const isValidTaskCommentId = createIdValidator("tc");
export const isValidChannelId = createIdValidator("ch");
export const isValidAssetProcessingJobId = createIdValidator("apj");
export const isValidFeedbackId = createIdValidator("fb");
export const isValidAgentId = createIdValidator("agent");
export const isValidTaskExecutionId = createIdValidator("txe");
export const isValidAgentStepId = createIdValidator("step");

/**
 * Utility to extract entity type from ID
 */
export const getEntityTypeFromId = (id: string): string | null => {
  if (id.includes("-")) {
    return id.split("-")[0] ?? null;
  }
  return null;
};

/**
 * Constants for easy access
 */
export const ID_CONSTANTS = {
  CLEAN_ALPHABET,
  STANDARD_LENGTH,
  PREFIXES: {
    USER: "user-",
    ACTOR: "actor-",
    TASK: "task-",
    BOOKMARK: "bm-",
    DOCUMENT: "doc-",
    PHOTO: "photo-",
    NOTE: "note-",
    TAG: "tag-",
    HISTORY: "hist-",
    API_KEY: "key-",
    CONVERSATION: "conv-",
    MESSAGE: "msg-",
    TASK_COMMENT: "tc-",
    CHANNEL: "ch-",
    ASSET_PROCESSING_JOB: "apj-",
    FEEDBACK: "fb-",
    AGENT: "agent-",
    TASK_EXECUTION: "txe-",
    AGENT_STEP: "step-",
  },
} as const;
