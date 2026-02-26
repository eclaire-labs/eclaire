import { ValidationError } from "./errors.js";

// Re-export detectAndVerifyMimeType from the all service for convenience
export { detectAndVerifyMimeType } from "./services/all.js";

/**
 * Parses JSON metadata from a multipart upload "metadata" field.
 * Returns the parsed object, defaulting to {} if no metadata is provided.
 * Throws ValidationError for malformed JSON.
 */
export function parseUploadMetadata(
  metadataPart: FormDataEntryValue | null,
): Record<string, unknown> {
  try {
    return JSON.parse((metadataPart as string) || "{}");
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ValidationError("Invalid metadata JSON format");
    }
    throw error;
  }
}
