import { ASSET_TYPES } from "@eclaire/core/types";
import z from "zod/v4";

export { ASSET_TYPES };

// Shared asset type schema - single source of truth
export const assetTypeSchema = z.enum(ASSET_TYPES);

export type AssetTypeSchema = z.infer<typeof assetTypeSchema>;
