import z from "zod/v4";
import { ASSET_COLLECTION_TYPE } from "../types/assets.js";

// Asset type values as a tuple for use in error messages
export const ASSET_TYPES = [
  ASSET_COLLECTION_TYPE.PHOTOS,
  ASSET_COLLECTION_TYPE.DOCUMENTS,
  ASSET_COLLECTION_TYPE.BOOKMARKS,
  ASSET_COLLECTION_TYPE.NOTES,
  ASSET_COLLECTION_TYPE.TASKS,
] as const;

// Shared asset type schema - single source of truth
export const assetTypeSchema = z.enum(ASSET_TYPES);

export type AssetTypeSchema = z.infer<typeof assetTypeSchema>;
