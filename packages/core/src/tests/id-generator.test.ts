import { describe, expect, it } from "vitest";
import {
  ID_CONSTANTS,
  generateAssetProcessingJobId,
  generateBookmarkId,
  generateChannelId,
  generateCleanId,
  generateConversationId,
  generateDocumentId,
  generateFeedbackId,
  generateHistoryId,
  generateMessageId,
  generateNoteId,
  generatePhotoId,
  generateSecurityId,
  generateStorageId,
  generateTagId,
  generateTaskCommentId,
  generateTaskId,
  generateUserId,
  getEntityTypeFromId,
  isValidAssetProcessingJobId,
  isValidBookmarkId,
  isValidChannelId,
  isValidConversationId,
  isValidDocumentId,
  isValidFeedbackId,
  isValidHistoryId,
  isValidMessageId,
  isValidNoteId,
  isValidPhotoId,
  isValidTagId,
  isValidTaskCommentId,
  isValidTaskId,
  isValidUserId,
  isValidApiKeyId,
  isValidTaskExecutionId,
  isValidAgentStepId,
  generateApiKeyId,
  generateTaskExecutionId,
  generateAgentStepId,
} from "../id-generator.js";

describe("generateCleanId", () => {
  it("generates a 15-character string", () => {
    expect(generateCleanId().length).toBe(15);
  });

  it("uses only alphanumeric characters", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateCleanId()).toMatch(/^[A-Za-z0-9]{15}$/);
    }
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateCleanId()));
    expect(ids.size).toBe(1000);
  });

  it("does not contain hyphens or underscores", () => {
    for (let i = 0; i < 100; i++) {
      const id = generateCleanId();
      expect(id).not.toContain("-");
      expect(id).not.toContain("_");
    }
  });
});

describe("generateSecurityId", () => {
  it("generates a valid UUID v4", () => {
    expect(generateSecurityId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("generates unique UUIDs", () => {
    const ids = new Set(
      Array.from({ length: 100 }, () => generateSecurityId()),
    );
    expect(ids.size).toBe(100);
  });
});

const entityGenerators = [
  { name: "generateUserId", fn: generateUserId, prefix: "user-" },
  { name: "generateTaskId", fn: generateTaskId, prefix: "task-" },
  { name: "generateBookmarkId", fn: generateBookmarkId, prefix: "bm-" },
  { name: "generateDocumentId", fn: generateDocumentId, prefix: "doc-" },
  { name: "generatePhotoId", fn: generatePhotoId, prefix: "photo-" },
  { name: "generateNoteId", fn: generateNoteId, prefix: "note-" },
  { name: "generateTagId", fn: generateTagId, prefix: "tag-" },
  { name: "generateHistoryId", fn: generateHistoryId, prefix: "hist-" },
  { name: "generateApiKeyId", fn: generateApiKeyId, prefix: "key-" },
  {
    name: "generateAssetProcessingJobId",
    fn: generateAssetProcessingJobId,
    prefix: "apj-",
  },
  {
    name: "generateConversationId",
    fn: generateConversationId,
    prefix: "conv-",
  },
  { name: "generateMessageId", fn: generateMessageId, prefix: "msg-" },
  {
    name: "generateTaskCommentId",
    fn: generateTaskCommentId,
    prefix: "tc-",
  },
  { name: "generateChannelId", fn: generateChannelId, prefix: "ch-" },
  { name: "generateFeedbackId", fn: generateFeedbackId, prefix: "fb-" },
  {
    name: "generateTaskExecutionId",
    fn: generateTaskExecutionId,
    prefix: "txe-",
  },
  {
    name: "generateAgentStepId",
    fn: generateAgentStepId,
    prefix: "step-",
  },
] as const;

describe.each(entityGenerators)("$name", ({ fn, prefix }) => {
  it("starts with the correct prefix", () => {
    expect(fn().startsWith(prefix)).toBe(true);
  });

  it(`has correct total length (${prefix.length} + 15 chars)`, () => {
    expect(fn().length).toBe(prefix.length + 15);
  });

  it("has alphanumeric suffix with no special chars", () => {
    const id = fn();
    const suffix = id.slice(prefix.length);
    expect(suffix).toMatch(/^[A-Za-z0-9]{15}$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => fn()));
    expect(ids.size).toBe(100);
  });
});

describe("generateStorageId", () => {
  it("generates a 15-character ID without extension", () => {
    const id = generateStorageId();
    expect(id.length).toBe(15);
    expect(id).toMatch(/^[A-Za-z0-9]{15}$/);
  });

  it("appends extension with dot separator", () => {
    const id = generateStorageId("jpg");
    expect(id).toMatch(/^[A-Za-z0-9]{15}\.jpg$/);
  });

  it("handles undefined extension", () => {
    const id = generateStorageId(undefined);
    expect(id.length).toBe(15);
    expect(id).toMatch(/^[A-Za-z0-9]{15}$/);
  });
});

const validatorPairs = [
  {
    name: "isValidUserId",
    validator: isValidUserId,
    generator: generateUserId,
    prefix: "user",
  },
  {
    name: "isValidTaskId",
    validator: isValidTaskId,
    generator: generateTaskId,
    prefix: "task",
  },
  {
    name: "isValidBookmarkId",
    validator: isValidBookmarkId,
    generator: generateBookmarkId,
    prefix: "bm",
  },
  {
    name: "isValidDocumentId",
    validator: isValidDocumentId,
    generator: generateDocumentId,
    prefix: "doc",
  },
  {
    name: "isValidPhotoId",
    validator: isValidPhotoId,
    generator: generatePhotoId,
    prefix: "photo",
  },
  {
    name: "isValidNoteId",
    validator: isValidNoteId,
    generator: generateNoteId,
    prefix: "note",
  },
  {
    name: "isValidTagId",
    validator: isValidTagId,
    generator: generateTagId,
    prefix: "tag",
  },
  {
    name: "isValidHistoryId",
    validator: isValidHistoryId,
    generator: generateHistoryId,
    prefix: "hist",
  },
  {
    name: "isValidApiKeyId",
    validator: isValidApiKeyId,
    generator: generateApiKeyId,
    prefix: "key",
  },
  {
    name: "isValidConversationId",
    validator: isValidConversationId,
    generator: generateConversationId,
    prefix: "conv",
  },
  {
    name: "isValidMessageId",
    validator: isValidMessageId,
    generator: generateMessageId,
    prefix: "msg",
  },
  {
    name: "isValidTaskCommentId",
    validator: isValidTaskCommentId,
    generator: generateTaskCommentId,
    prefix: "tc",
  },
  {
    name: "isValidChannelId",
    validator: isValidChannelId,
    generator: generateChannelId,
    prefix: "ch",
  },
  {
    name: "isValidAssetProcessingJobId",
    validator: isValidAssetProcessingJobId,
    generator: generateAssetProcessingJobId,
    prefix: "apj",
  },
  {
    name: "isValidFeedbackId",
    validator: isValidFeedbackId,
    generator: generateFeedbackId,
    prefix: "fb",
  },
  {
    name: "isValidTaskExecutionId",
    validator: isValidTaskExecutionId,
    generator: generateTaskExecutionId,
    prefix: "txe",
  },
  {
    name: "isValidAgentStepId",
    validator: isValidAgentStepId,
    generator: generateAgentStepId,
    prefix: "step",
  },
] as const;

describe.each(validatorPairs)("$name", ({ validator, generator, prefix }) => {
  it("accepts IDs generated by the corresponding generator", () => {
    expect(validator(generator())).toBe(true);
  });

  it("rejects an ID with wrong prefix", () => {
    expect(validator(`wrong-${generateCleanId()}`)).toBe(false);
  });

  it("rejects an ID with too-short suffix", () => {
    expect(validator(`${prefix}-abc`)).toBe(false);
  });

  it("rejects an ID with too-long suffix", () => {
    expect(validator(`${prefix}-${"a".repeat(20)}`)).toBe(false);
  });

  it("rejects an ID with special characters in suffix", () => {
    expect(validator(`${prefix}-abc_def!gh12345`)).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(validator("")).toBe(false);
  });

  it("rejects an ID with no suffix", () => {
    expect(validator(`${prefix}-`)).toBe(false);
  });
});

describe("getEntityTypeFromId", () => {
  it("extracts 'user' from a user ID", () => {
    expect(getEntityTypeFromId("user-abc123")).toBe("user");
  });

  it("extracts 'bm' from a bookmark ID", () => {
    expect(getEntityTypeFromId("bm-abc123")).toBe("bm");
  });

  it("extracts prefix from multi-dash ID", () => {
    expect(getEntityTypeFromId("key-abc-def")).toBe("key");
  });

  it("returns null for ID without dash", () => {
    expect(getEntityTypeFromId("nodashes")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getEntityTypeFromId("")).toBeNull();
  });
});

describe("ID_CONSTANTS", () => {
  it("CLEAN_ALPHABET contains only alphanumeric characters", () => {
    expect(ID_CONSTANTS.CLEAN_ALPHABET).toMatch(/^[A-Za-z0-9]+$/);
    expect(ID_CONSTANTS.CLEAN_ALPHABET.length).toBe(62);
  });

  it("STANDARD_LENGTH is 15", () => {
    expect(ID_CONSTANTS.STANDARD_LENGTH).toBe(15);
  });

  it("PREFIXES contains all 20 entity prefixes", () => {
    expect(Object.keys(ID_CONSTANTS.PREFIXES).length).toBe(20);
  });

  it("all PREFIXES end with a dash", () => {
    for (const value of Object.values(ID_CONSTANTS.PREFIXES)) {
      expect(value.endsWith("-")).toBe(true);
    }
  });

  it("PREFIXES match the generators", () => {
    expect(ID_CONSTANTS.PREFIXES.USER).toBe("user-");
    expect(ID_CONSTANTS.PREFIXES.BOOKMARK).toBe("bm-");
    expect(ID_CONSTANTS.PREFIXES.PHOTO).toBe("photo-");
    expect(ID_CONSTANTS.PREFIXES.FEEDBACK).toBe("fb-");
  });
});
