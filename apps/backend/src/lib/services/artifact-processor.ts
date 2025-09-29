import type { AssetType } from "../../types/assets";
import { createChildLogger } from "../logger";
import { updateBookmarkArtifacts } from "./bookmarks";
import { updateDocumentArtifacts } from "./documents";
import { updateNoteArtifacts } from "./notes"; // You will uncomment these later
import { updatePhotoArtifacts } from "./photos";
import { updateTaskArtifacts } from "./tasks";

const logger = createChildLogger("artifact-processor");

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
      // This calls the existing service function you already have for photos.
      await updatePhotoArtifacts(assetId, artifacts);
      logger.info(
        { assetType, assetId },
        "Successfully processed photo artifacts.",
      );
      break;

    case "notes":
      // The dispatcher now knows how to handle note artifacts.
      await updateNoteArtifacts(assetId, artifacts);
      logger.info(
        { assetType, assetId },
        "Successfully processed note artifacts.",
      );
      break;

    case "bookmarks":
      await updateBookmarkArtifacts(assetId, artifacts);
      logger.info(
        { assetType, assetId },
        "Successfully processed bookmark artifacts.",
      );
      break;
    case "tasks":
      await updateTaskArtifacts(assetId, artifacts);
      logger.info(
        { assetType, assetId },
        "Successfully processed task artifacts.",
      );
      break;
    case "documents":
      await updateDocumentArtifacts(assetId, artifacts);
      logger.info(
        { assetType, assetId },
        "Successfully processed document artifacts.",
      );
      break;

    default:
      // This will catch calls for 'notes', 'documents', etc., until you add their cases.
      logger.warn(
        { assetType, assetId },
        "Received artifacts for an asset type with no defined handler. Ignoring.",
      );
      break;
  }
}
