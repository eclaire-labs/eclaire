import { eq, type sql } from "drizzle-orm";
import type { AssetType } from "../../types/assets.js";
import { db, schema } from "../../db/index.js";
import { createChildLogger } from "../logger.js";
import { updateBookmarkArtifacts } from "./bookmarks.js";
import { updateDocumentArtifacts } from "./documents.js";
import { updateNoteArtifacts } from "./notes.js";
import { updateMediaArtifacts } from "./media.js";
import { updatePhotoArtifacts } from "./photos.js";
import { updateTaskArtifacts } from "./tasks.js";

const logger = createChildLogger("artifact-processor");

const assetTypeToTable: Record<string, { table: unknown; idCol: unknown }> = {
  bookmarks: { table: schema.bookmarks, idCol: schema.bookmarks.id },
  documents: { table: schema.documents, idCol: schema.documents.id },
  notes: { table: schema.notes, idCol: schema.notes.id },
  photos: { table: schema.photos, idCol: schema.photos.id },
  media: { table: schema.media, idCol: schema.media.id },
  tasks: { table: schema.tasks, idCol: schema.tasks.id },
};

/**
 * Set the processing_status column on an entity row.
 * Used by the artifact processor and queue job lifecycle.
 */
export async function setEntityProcessingStatus(
  assetType: string,
  assetId: string,
  status: "pending" | "processing" | "completed" | "failed",
): Promise<void> {
  const mapping = assetTypeToTable[assetType];
  if (!mapping) return;
  await db
    .update(mapping.table as Parameters<typeof db.update>[0])
    .set({ processingStatus: status })
    .where(eq(mapping.idCol as ReturnType<typeof sql>, assetId));
}

/**
 * Main dispatcher for processing artifacts from workers.
 * It validates the asset type and routes the artifact payload
 * to the appropriate type-specific handler.
 *
 * @param assetType The type of the asset ('photos', 'notes', etc.).
 * @param assetId The ID of the asset.
 * @param artifacts The payload from the worker containing the results.
 */
export async function processArtifacts(
  assetType: AssetType,
  assetId: string,
  // biome-ignore lint/suspicious/noExplicitAny: generic artifact record
  artifacts: Record<string, any>,
): Promise<void> {
  const rawContent = JSON.stringify(artifacts, null, 2);
  const truncatedContent =
    rawContent.length > 200
      ? `${rawContent.substring(0, 100)}...${rawContent.substring(rawContent.length - 100)}`
      : rawContent;

  logger.info(
    {
      assetType,
      assetId,
      artifactsRaw: truncatedContent,
      totalLength: rawContent.length,
    },
    "ARTIFACT_INPUT: Artifacts received",
  );

  switch (assetType) {
    case "photos":
      await updatePhotoArtifacts(assetId, artifacts);
      break;
    case "notes":
      await updateNoteArtifacts(assetId, artifacts);
      break;
    case "bookmarks":
      await updateBookmarkArtifacts(assetId, artifacts);
      break;
    case "tasks":
      await updateTaskArtifacts(assetId, artifacts);
      break;
    case "documents":
      await updateDocumentArtifacts(assetId, artifacts);
      break;
    case "media":
      await updateMediaArtifacts(assetId, artifacts);
      break;
    default:
      logger.warn(
        { assetType, assetId },
        "Received artifacts for an asset type with no defined handler.",
      );
      return;
  }

  // Mark entity as completed after artifacts are saved
  await setEntityProcessingStatus(assetType, assetId, "completed");
  logger.info({ assetType, assetId }, "Successfully processed artifacts.");
}
