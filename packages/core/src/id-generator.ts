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
export const isValidUserId = (id: string): boolean =>
  /^user-[A-Za-z0-9]{15}$/.test(id);
export const isValidTaskId = (id: string): boolean =>
  /^task-[A-Za-z0-9]{15}$/.test(id);
export const isValidBookmarkId = (id: string): boolean =>
  /^bm-[A-Za-z0-9]{15}$/.test(id);
export const isValidDocumentId = (id: string): boolean =>
  /^doc-[A-Za-z0-9]{15}$/.test(id);
export const isValidPhotoId = (id: string): boolean =>
  /^photo-[A-Za-z0-9]{15}$/.test(id);
export const isValidNoteId = (id: string): boolean =>
  /^note-[A-Za-z0-9]{15}$/.test(id);
export const isValidTagId = (id: string): boolean =>
  /^tag-[A-Za-z0-9]{15}$/.test(id);
export const isValidHistoryId = (id: string): boolean =>
  /^hist-[A-Za-z0-9]{15}$/.test(id);
export const isValidApiKeyId = (id: string): boolean =>
  /^key-[A-Za-z0-9]{15}$/.test(id);
export const isValidConversationId = (id: string): boolean =>
  /^conv-[A-Za-z0-9]{15}$/.test(id);
export const isValidMessageId = (id: string): boolean =>
  /^msg-[A-Za-z0-9]{15}$/.test(id);
export const isValidTaskCommentId = (id: string): boolean =>
  /^tc-[A-Za-z0-9]{15}$/.test(id);
export const isValidChannelId = (id: string): boolean =>
  /^ch-[A-Za-z0-9]{15}$/.test(id);

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
  },
} as const;
