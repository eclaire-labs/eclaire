import { z } from "zod";
import { ASSET_COLLECTION_TYPE } from "../types/assets";

// Shared asset type schema - single source of truth
export const assetTypeSchema = z.enum([
  ASSET_COLLECTION_TYPE.PHOTOS,
  ASSET_COLLECTION_TYPE.DOCUMENTS,
  ASSET_COLLECTION_TYPE.BOOKMARKS,
  ASSET_COLLECTION_TYPE.NOTES,
  ASSET_COLLECTION_TYPE.TASKS,
]);

export type AssetTypeSchema = z.infer<typeof assetTypeSchema>;
