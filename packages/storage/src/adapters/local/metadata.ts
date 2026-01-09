/**
 * Sidecar metadata handling for local storage
 *
 * Each stored file has a companion .meta.json file containing its metadata.
 * For example: original.pdf has original.pdf.meta.json
 */

import { readFile, stat, unlink, writeFile } from "node:fs/promises";
import type { ObjectMetadata } from "../../core/types.js";

/**
 * Metadata stored in sidecar files
 */
interface SidecarMetadata {
  contentType: string;
  size: number;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  custom?: Record<string, string>;
}

/**
 * Get the metadata file path for a given file path
 */
export function getMetadataPath(filePath: string): string {
  return `${filePath}.meta.json`;
}

/**
 * Read metadata from sidecar file
 *
 * @param filePath - Path to the main file (not the metadata file)
 * @returns ObjectMetadata or null if metadata file doesn't exist
 */
export async function readMetadata(
  filePath: string,
): Promise<ObjectMetadata | null> {
  const metaPath = getMetadataPath(filePath);

  try {
    const content = await readFile(metaPath, "utf-8");
    const sidecar: SidecarMetadata = JSON.parse(content);

    return {
      contentType: sidecar.contentType,
      size: sidecar.size,
      createdAt: new Date(sidecar.createdAt),
      updatedAt: new Date(sidecar.updatedAt),
      custom: sidecar.custom,
    };
  } catch (error) {
    // If metadata file doesn't exist, try to infer from file stats
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * Read metadata or infer from file stats if sidecar doesn't exist
 *
 * @param filePath - Path to the main file
 * @param defaultContentType - Content type to use if not in metadata
 * @returns ObjectMetadata
 */
export async function readMetadataOrInfer(
  filePath: string,
  defaultContentType: string = "application/octet-stream",
): Promise<ObjectMetadata> {
  const metadata = await readMetadata(filePath);
  if (metadata) {
    return metadata;
  }

  // Infer from file stats
  const stats = await stat(filePath);
  return {
    contentType: defaultContentType,
    size: stats.size,
    createdAt: stats.birthtime,
    updatedAt: stats.mtime,
  };
}

/**
 * Write metadata to sidecar file
 *
 * @param filePath - Path to the main file (not the metadata file)
 * @param metadata - Metadata to write
 */
export async function writeMetadata(
  filePath: string,
  metadata: ObjectMetadata,
): Promise<void> {
  const metaPath = getMetadataPath(filePath);

  const sidecar: SidecarMetadata = {
    contentType: metadata.contentType,
    size: metadata.size,
    createdAt: metadata.createdAt.toISOString(),
    updatedAt: metadata.updatedAt.toISOString(),
    custom: metadata.custom,
  };

  await writeFile(metaPath, JSON.stringify(sidecar, null, 2), "utf-8");
}

/**
 * Delete metadata sidecar file
 *
 * @param filePath - Path to the main file (not the metadata file)
 */
export async function deleteMetadata(filePath: string): Promise<void> {
  const metaPath = getMetadataPath(filePath);

  try {
    await unlink(metaPath);
  } catch (error) {
    // Ignore if file doesn't exist
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

/**
 * Check if a path is a metadata sidecar file
 */
export function isMetadataFile(path: string): boolean {
  return path.endsWith(".meta.json");
}
