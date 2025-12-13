// main-api/src/lib/storage.ts

// Import env-loader first to ensure environment variables are loaded
import "./env-loader";
import fs, { promises as fsPromises } from "fs";
import path from "path";
import { Readable } from "stream";
import { generateStorageId } from "@eclaire/core";
import { createChildLogger } from "./logger.js";

const logger = createChildLogger("storage");

// Use environment variable for base storage directory
// Support both USERS_DIR (backend) and WORKER_SHARED_DATA_PATH (workers) with fallback
const BASE_STORAGE_DIR =
  process.env.USERS_DIR ||
  process.env.WORKER_SHARED_DATA_PATH ||
  path.join(process.cwd(), "data");

// Legacy interface for backward compatibility
export interface SaveObjectOptions {
  userId: string;
  fileStream: Readable;
  contentType: string;
  subfolder: string; // e.g., "bookmarks/screenshots", "documents"
}

// New asset-instance interface
export interface SaveAssetOptions {
  userId: string;
  assetType: "bookmarks" | "documents" | "photos" | "notes" | "tasks";
  assetId: string;
  fileName: string; // e.g., 'original.pdf', 'thumbnail.png', 'images/img1.jpg'
  fileStream: Readable;
  contentType: string;
}

export interface StorageInfo {
  storageId: string;
}

export interface GetObjectOutput {
  stream: ReadableStream<Uint8Array>;
  contentType?: string;
  contentLength?: number;
}

export class LocalObjectStorage {
  private baseDir: string;

  constructor(baseDir: string = BASE_STORAGE_DIR) {
    this.baseDir = baseDir;
    this.ensureDirectoryExists(this.baseDir).catch((err) => {
      logger.error(
        {
          baseDir: this.baseDir,
          error: err instanceof Error ? err.message : "Unknown error",
          stack: err instanceof Error ? err.stack : undefined,
        },
        "Failed to ensure base storage directory exists on init",
      );
    });
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fsPromises.mkdir(dirPath, { recursive: true });
    } catch (error: any) {
      if (error.code !== "EEXIST") {
        throw new Error(`Failed to create directory: ${dirPath}`);
      }
    }
  }

  private getFullPath(storageId: string): string {
    const safeStorageId = path
      .normalize(storageId)
      .replace(/^(\.\.(\/|\\|$))+/, "");
    if (path.isAbsolute(safeStorageId) || safeStorageId.includes("..")) {
      throw new Error("Invalid storageId: Path traversal detected.");
    }
    return path.join(this.baseDir, safeStorageId);
  }

  private generateStorageId(
    userId: string,
    contentType: string,
    subfolder: string,
  ): string {
    // More robust parsing with better fallbacks
    const fileExtension = contentType?.split("/").pop()?.split("+")[0] || "bin";

    // Ensure extension is a valid string
    const safeExtension = fileExtension || "bin";

    const uniqueFilename = generateStorageId(safeExtension);

    // Add debugging to see what's going wrong
    if (!userId || !subfolder || !uniqueFilename) {
      logger.error(
        {
          userId,
          contentType,
          subfolder,
          fileExtension,
          safeExtension,
          uniqueFilename,
        },
        "generateStorageId received invalid parameters",
      );
      throw new Error("Invalid parameters for storage ID generation");
    }

    return path.join(userId, subfolder, uniqueFilename);
  }

  private generateAssetStorageId(
    userId: string,
    assetType: string,
    assetId: string,
    fileName: string,
  ): string {
    if (!userId || !assetType || !assetId || !fileName) {
      logger.error(
        {
          userId,
          assetType,
          assetId,
          fileName,
        },
        "generateAssetStorageId received invalid parameters",
      );
      throw new Error("Invalid parameters for asset storage ID generation");
    }

    return path.join(userId, assetType, assetId, fileName);
  }

  // Legacy method for backward compatibility
  async save(options: SaveObjectOptions): Promise<StorageInfo> {
    const { userId, fileStream, contentType, subfolder } = options;
    const storageId = this.generateStorageId(userId, contentType, subfolder);
    const fullPath = this.getFullPath(storageId);
    const dirPath = path.dirname(fullPath);

    await this.ensureDirectoryExists(dirPath);

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(fullPath);
      fileStream.pipe(writeStream);
      writeStream.on("finish", () => resolve({ storageId }));
      writeStream.on("error", (error) => {
        fsPromises.unlink(fullPath).catch(() => {});
        reject(new Error(`Failed to store file: ${error.message}`));
      });
      fileStream.on("error", (error) => {
        writeStream.end();
        fsPromises.unlink(fullPath).catch(() => {});
        reject(new Error(`Failed to read upload stream: ${error.message}`));
      });
    });
  }

  // New asset-instance method
  async saveAsset(options: SaveAssetOptions): Promise<StorageInfo> {
    const { userId, assetType, assetId, fileName, fileStream, contentType } =
      options;
    const storageId = this.generateAssetStorageId(
      userId,
      assetType,
      assetId,
      fileName,
    );
    const fullPath = this.getFullPath(storageId);
    const dirPath = path.dirname(fullPath);

    await this.ensureDirectoryExists(dirPath);

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(fullPath);
      fileStream.pipe(writeStream);
      writeStream.on("finish", () => {
        logger.debug(
          { storageId, assetType, assetId, fileName },
          "Asset saved successfully",
        );
        resolve({ storageId });
      });
      writeStream.on("error", (error) => {
        fsPromises.unlink(fullPath).catch(() => {});
        reject(new Error(`Failed to store asset file: ${error.message}`));
      });
      fileStream.on("error", (error) => {
        writeStream.end();
        fsPromises.unlink(fullPath).catch(() => {});
        reject(
          new Error(`Failed to read asset upload stream: ${error.message}`),
        );
      });
    });
  }

  async saveBuffer(buffer: Buffer, storageId: string): Promise<void> {
    const fullPath = this.getFullPath(storageId);
    const dirPath = path.dirname(fullPath);

    await this.ensureDirectoryExists(dirPath);

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(fullPath);
      const readStream = Readable.from(buffer);

      readStream.pipe(writeStream);

      writeStream.on("finish", resolve);
      writeStream.on("error", (error) => {
        fsPromises.unlink(fullPath).catch(() => {});
        reject(new Error(`Failed to store buffer: ${error.message}`));
      });
      readStream.on("error", (error) => {
        writeStream.end();
        fsPromises.unlink(fullPath).catch(() => {});
        reject(new Error(`Failed to read buffer stream: ${error.message}`));
      });
    });
  }

  // New method to save asset buffer directly
  async saveAssetBuffer(
    buffer: Buffer,
    userId: string,
    assetType: string,
    assetId: string,
    fileName: string,
  ): Promise<StorageInfo> {
    const storageId = this.generateAssetStorageId(
      userId,
      assetType,
      assetId,
      fileName,
    );
    await this.saveBuffer(buffer, storageId);
    logger.debug(
      { storageId, assetType, assetId, fileName },
      "Asset buffer saved successfully",
    );
    return { storageId };
  }

  async getStream(storageId: string): Promise<GetObjectOutput> {
    const fullPath = this.getFullPath(storageId);
    try {
      await fsPromises.access(fullPath, fs.constants.R_OK);
      const stats = await fsPromises.stat(fullPath);
      const nodeStream = fs.createReadStream(fullPath);
      // Convert Node.js ReadStream to Web ReadableStream to avoid race conditions
      // when passed to the Response constructor
      const stream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
      return { stream, contentLength: stats.size };
    } catch (error: any) {
      if (error.code === "ENOENT" || error.code === "EACCES") {
        const notFoundError = new Error(
          `File not found for storageId: ${storageId}`,
        );
        (notFoundError as any).code = "ENOENT";
        throw notFoundError;
      }
      throw new Error("Failed to read file");
    }
  }

  /**
   * Reads a file and returns its content as a Buffer.
   * Use this when you need the entire file content in memory.
   * For streaming to HTTP responses, use getStream() instead.
   */
  async getBuffer(storageId: string): Promise<Buffer> {
    const fullPath = this.getFullPath(storageId);
    try {
      return await fsPromises.readFile(fullPath);
    } catch (error: any) {
      if (error.code === "ENOENT" || error.code === "EACCES") {
        const notFoundError = new Error(
          `File not found for storageId: ${storageId}`,
        );
        (notFoundError as any).code = "ENOENT";
        throw notFoundError;
      }
      throw new Error("Failed to read file");
    }
  }

  async delete(storageId: string): Promise<void> {
    const fullPath = this.getFullPath(storageId);
    try {
      await fsPromises.unlink(fullPath);
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        throw new Error("Failed to delete file");
      }
    }
  }

  // New method to delete entire asset folder
  async deleteAsset(
    userId: string,
    assetType: string,
    assetId: string,
  ): Promise<void> {
    const assetPath = path.join(userId, assetType, assetId);
    const fullPath = this.getFullPath(assetPath);
    try {
      await fsPromises.rm(fullPath, { recursive: true, force: true });
      logger.debug(
        { userId, assetType, assetId, assetPath },
        "Asset folder deleted successfully",
      );
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        logger.error(
          { userId, assetType, assetId, error: error.message },
          "Failed to delete asset folder",
        );
        throw new Error("Failed to delete asset folder");
      }
    }
  }

  // Utility method to check if asset file exists
  async assetExists(
    userId: string,
    assetType: string,
    assetId: string,
    fileName: string,
  ): Promise<boolean> {
    const storageId = this.generateAssetStorageId(
      userId,
      assetType,
      assetId,
      fileName,
    );
    const fullPath = this.getFullPath(storageId);
    try {
      await fsPromises.access(fullPath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  // Utility method to list files in an asset folder
  async listAssetFiles(
    userId: string,
    assetType: string,
    assetId: string,
  ): Promise<string[]> {
    const assetPath = path.join(userId, assetType, assetId);
    const fullPath = this.getFullPath(assetPath);
    try {
      const files = await fsPromises.readdir(fullPath, { recursive: true });
      return files.filter((file) => typeof file === "string") as string[];
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw new Error("Failed to list asset files");
    }
  }

  // New methods for storage statistics

  /**
   * Get the size of a file in bytes
   */
  private async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fsPromises.stat(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Calculate total storage size for a specific asset type for a user
   */
  async getAssetTypeStorageSize(
    userId: string,
    assetType: string,
  ): Promise<number> {
    const assetTypePath = path.join(userId, assetType);
    const fullPath = this.getFullPath(assetTypePath);

    try {
      return await this.getDirectorySize(fullPath);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return 0;
      }
      logger.error(
        { userId, assetType, error: error.message },
        "Failed to calculate asset type storage size",
      );
      return 0;
    }
  }

  /**
   * Calculate the total size of a directory recursively
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    try {
      let totalSize = 0;

      const items = await fsPromises.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const itemPath = path.join(dirPath, item.name);

        if (item.isFile()) {
          const stats = await fsPromises.stat(itemPath);
          totalSize += stats.size;
        } else if (item.isDirectory()) {
          totalSize += await this.getDirectorySize(itemPath);
        }
      }

      return totalSize;
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return 0;
      }
      throw error;
    }
  }

  /**
   * Get storage statistics for all asset types for a user
   */
  async getUserStorageStats(userId: string): Promise<{
    bookmarks: { count: number; size: number };
    documents: { count: number; size: number };
    photos: { count: number; size: number };
    notes: { count: number; size: number };
    tasks: { count: number; size: number };
    total: { count: number; size: number };
  }> {
    const assetTypes = ["bookmarks", "documents", "photos", "notes", "tasks"];
    const stats = {
      bookmarks: { count: 0, size: 0 },
      documents: { count: 0, size: 0 },
      photos: { count: 0, size: 0 },
      notes: { count: 0, size: 0 },
      tasks: { count: 0, size: 0 },
      total: { count: 0, size: 0 },
    };

    try {
      const userPath = this.getFullPath(userId);

      // Check if user directory exists
      try {
        await fsPromises.access(userPath);
      } catch {
        logger.debug({ userId }, "User storage directory does not exist");
        return stats; // User has no storage yet
      }

      for (const assetType of assetTypes) {
        const assetTypePath = path.join(userPath, assetType);

        try {
          const assetIds = await fsPromises.readdir(assetTypePath);
          const assetCount = assetIds.length;
          const assetSize = await this.getAssetTypeStorageSize(
            userId,
            assetType,
          );

          logger.debug(
            {
              userId,
              assetType,
              assetCount,
              assetSize,
              assetSizeFormatted: LocalObjectStorage.formatBytes(assetSize),
            },
            "Calculated storage stats for asset type",
          );

          (stats as any)[assetType] = { count: assetCount, size: assetSize };
          stats.total.count += assetCount;
          stats.total.size += assetSize;
        } catch (error: any) {
          if (error.code !== "ENOENT") {
            logger.error(
              { userId, assetType, error: error.message },
              "Failed to get stats for asset type",
            );
          } else {
            logger.debug(
              { userId, assetType },
              "Asset type directory does not exist",
            );
          }
          // Asset type directory doesn't exist, counts remain 0
        }
      }

      logger.debug(
        {
          userId,
          totalCount: stats.total.count,
          totalSize: stats.total.size,
          totalSizeFormatted: LocalObjectStorage.formatBytes(stats.total.size),
        },
        "Final storage stats calculated",
      );

      return stats;
    } catch (error: any) {
      logger.error(
        { userId, error: error.message },
        "Failed to get user storage stats",
      );
      return stats;
    }
  }

  /**
   * Format bytes to human readable string
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / k ** i).toFixed(2)) + " " + sizes[i];
  }
}

export const objectStorage = new LocalObjectStorage();

// Helper functions for common asset file names
export const AssetFileNames = {
  // Common file names
  original: (ext: string) => `original.${ext}`,
  converted: (ext: string) => `converted.${ext}`,
  thumbnail: "thumbnail.png",
  screenshot: "screenshot.png",

  // Document-specific
  document: {
    original: (ext: string) => `original.${ext}`,
    convertedPdf: "converted.pdf",
    thumbnail: "thumbnail.png",
    content: {
      markdown: "content.md",
      text: "content.txt",
      html: "content.html",
    },
    ocr: {
      tesseract: "ocr/tesseract.txt",
      easyocr: "ocr/easyocr.txt",
      docling: "ocr/docling.json",
    },
    ai: {
      summary: "ai-analysis/summary.txt",
      tags: "ai-analysis/tags.json",
      embedding: "ai-analysis/embedding.vec",
      sentiment: "ai-analysis/sentiment.json",
    },
  },

  // Bookmark-specific
  bookmark: {
    original: (ext: string) => `original.${ext}`,
    screenshot: "screenshot.png",
    convertedPdf: "converted.pdf",
    thumbnail: "thumbnail.png",
    archive: "archive.html",
    readability: "readability.txt",
    metadata: "metadata.json",
    image: (index: number, ext: string) => `images/img${index}.${ext}`,
    document: (index: number, ext: string) => `documents/doc${index}.${ext}`,
  },

  // Photo-specific
  photo: {
    original: (ext: string) => `original.${ext}`,
    converted: "converted.jpg",
    thumbnail: "thumbnail.png",
    analysis: "ai-analysis.json",
    variants: {
      small: "variants/small.jpg",
      medium: "variants/medium.jpg",
      large: "variants/large.jpg",
    },
  },

  // Note-specific
  note: {
    original: (ext: string) => `original.${ext}`,
    convertedPdf: "converted.pdf",
    thumbnail: "thumbnail.png",
    attachment: (index: number, ext: string) =>
      `attachments/attachment${index}.${ext}`,
  },

  // Task-specific
  task: {
    original: (ext: string) => `original.${ext}`,
    convertedPdf: "converted.pdf",
    attachment: (index: number, ext: string) =>
      `attachments/attachment${index}.${ext}`,
  },
} as const;
