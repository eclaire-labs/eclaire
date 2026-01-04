/**
 * Asset Fetcher
 *
 * Fetches content from various asset types for inclusion in AI context.
 * Extracted from the original prompt.ts for better modularity.
 */

import { and, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { getStorage } from "../storage/index.js";
import { createChildLogger } from "../logger.js";
import type { AssetReference } from "../../schemas/prompt-params.js";
import type { AssetContent } from "./system-prompt-builder.js";

const { bookmarks, documents, notes, photos, tasks } = schema;

const logger = createChildLogger("asset-fetcher");

/**
 * Fetches the text content for a specific asset reference
 */
export async function fetchAssetContent(
  assetRef: AssetReference,
  userId: string,
): Promise<string | null> {
  try {
    logger.debug(
      { assetType: assetRef.type, assetId: assetRef.id, userId },
      "Fetching asset content",
    );

    switch (assetRef.type) {
      case "note": {
        const [note] = await db
          .select({ content: notes.content })
          .from(notes)
          .where(and(eq(notes.id, assetRef.id), eq(notes.userId, userId)));

        if (!note) {
          logger.warn({ assetId: assetRef.id, userId }, "Note not found");
          return null;
        }

        return note.content || null;
      }

      case "bookmark": {
        const [bookmark] = await db
          .select({
            extractedTxtStorageId: bookmarks.extractedTxtStorageId,
            extractedText: bookmarks.extractedText,
            title: bookmarks.title,
            description: bookmarks.description,
          })
          .from(bookmarks)
          .where(
            and(eq(bookmarks.id, assetRef.id), eq(bookmarks.userId, userId)),
          );

        if (!bookmark) {
          logger.warn({ assetId: assetRef.id, userId }, "Bookmark not found");
          return null;
        }

        // Try to get content from extractedText field first (faster)
        if (bookmark.extractedText) {
          return bookmark.extractedText;
        }

        // Try to get content from storage file
        if (bookmark.extractedTxtStorageId) {
          try {
            const storage = getStorage();
            const { buffer } = await storage.readBuffer(
              bookmark.extractedTxtStorageId,
            );
            return buffer.toString("utf-8");
          } catch (storageError) {
            logger.warn(
              {
                assetId: assetRef.id,
                storageError:
                  storageError instanceof Error
                    ? storageError.message
                    : "Unknown error",
              },
              "Failed to retrieve bookmark content from storage, falling back to title/description",
            );
          }
        }

        // Fallback to title and description
        const fallbackContent = [bookmark.title, bookmark.description]
          .filter(Boolean)
          .join("\n\n");
        return fallbackContent || null;
      }

      case "document": {
        const [document] = await db
          .select({
            extractedMdStorageId: documents.extractedMdStorageId,
            extractedTxtStorageId: documents.extractedTxtStorageId,
            extractedText: documents.extractedText,
            title: documents.title,
            description: documents.description,
          })
          .from(documents)
          .where(
            and(eq(documents.id, assetRef.id), eq(documents.userId, userId)),
          );

        if (!document) {
          logger.warn({ assetId: assetRef.id, userId }, "Document not found");
          return null;
        }

        // Try to get markdown content first
        if (document.extractedMdStorageId) {
          try {
            const storage = getStorage();
            const { buffer } = await storage.readBuffer(
              document.extractedMdStorageId,
            );
            return buffer.toString("utf-8");
          } catch (markdownError) {
            logger.warn(
              {
                assetId: assetRef.id,
                storageError:
                  markdownError instanceof Error
                    ? markdownError.message
                    : "Unknown error",
              },
              "Failed to retrieve document markdown, trying plain text",
            );
          }
        }

        // Try plain text from storage
        if (document.extractedTxtStorageId) {
          try {
            const storage = getStorage();
            const { buffer } = await storage.readBuffer(
              document.extractedTxtStorageId,
            );
            return buffer.toString("utf-8");
          } catch (textError) {
            logger.warn(
              {
                assetId: assetRef.id,
                storageError:
                  textError instanceof Error
                    ? textError.message
                    : "Unknown error",
              },
              "Failed to retrieve document text, falling back to database field",
            );
          }
        }

        // Fallback to extracted text in database
        if (document.extractedText) {
          return document.extractedText;
        }

        // Final fallback to title and description
        const fallbackContent = [document.title, document.description]
          .filter(Boolean)
          .join("\n\n");
        return fallbackContent || null;
      }

      case "photo": {
        const [photo] = await db
          .select({
            ocrText: photos.ocrText,
            title: photos.title,
            description: photos.description,
          })
          .from(photos)
          .where(and(eq(photos.id, assetRef.id), eq(photos.userId, userId)));

        if (!photo) {
          logger.warn({ assetId: assetRef.id, userId }, "Photo not found");
          return null;
        }

        const contentParts = [photo.title, photo.description, photo.ocrText].filter(
          Boolean,
        );
        return contentParts.length > 0 ? contentParts.join("\n\n") : null;
      }

      case "task": {
        const [task] = await db
          .select({
            title: tasks.title,
            description: tasks.description,
          })
          .from(tasks)
          .where(and(eq(tasks.id, assetRef.id), eq(tasks.userId, userId)));

        if (!task) {
          logger.warn({ assetId: assetRef.id, userId }, "Task not found");
          return null;
        }

        const contentParts = [task.title, task.description].filter(Boolean);
        return contentParts.length > 0 ? contentParts.join("\n\n") : null;
      }

      default:
        logger.warn(
          { assetType: assetRef.type, assetId: assetRef.id },
          "Unknown asset type",
        );
        return null;
    }
  } catch (error) {
    logger.error(
      {
        assetType: assetRef.type,
        assetId: assetRef.id,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error fetching asset content",
    );
    return null;
  }
}

/**
 * Fetch content for multiple assets
 */
export async function fetchAssetContents(
  assets: AssetReference[],
  userId: string,
): Promise<AssetContent[]> {
  const results: AssetContent[] = [];

  for (const assetRef of assets) {
    try {
      const content = await fetchAssetContent(assetRef, userId);
      results.push({
        type: assetRef.type,
        id: assetRef.id,
        content: content || `[${assetRef.type} content not available]`,
      });
    } catch (error) {
      logger.warn(
        {
          assetType: assetRef.type,
          assetId: assetRef.id,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to fetch asset content, skipping",
      );
      results.push({
        type: assetRef.type,
        id: assetRef.id,
        content: `[Error retrieving ${assetRef.type} content]`,
      });
    }
  }

  return results;
}
