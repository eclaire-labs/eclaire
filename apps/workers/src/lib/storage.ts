// worker-service/src/lib/storage.ts

// Import env-loader first to ensure environment variables are loaded
import "./env-loader";
import fs, { promises as fsPromises, type ReadStream } from "fs";
import path from "path";
import { Readable } from "stream";
import { createChildLogger } from "./logger";

const logger = createChildLogger("storage");

// --- Configuration ---
const WORKER_BASE_STORAGE_DIR = process.env.WORKER_SHARED_DATA_PATH;

if (!WORKER_BASE_STORAGE_DIR) {
  throw new Error(
    "FATAL: WORKER_SHARED_DATA_PATH environment variable is required.",
  );
}
logger.info({ basePath: WORKER_BASE_STORAGE_DIR }, "Worker storage configured");

// Legacy interface for backward compatibility
export interface SaveObjectOptions {
  userId: string;
  fileStream: Readable;
  contentType: string;
  subfolder: string; // e.g., "bookmarks/screenshots", "bookmarks/pdfs"
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
  storageId: string; // The full relative path, e.g., "user123/bookmarks/xyz/original.pdf"
}

export interface GetObjectOutput {
  stream: ReadStream;
  contentType?: string;
  contentLength?: number;
}

export class LocalObjectStorage {
  private baseDir: string;

  constructor(baseDir: string = WORKER_BASE_STORAGE_DIR!) {
    this.baseDir = baseDir;
    this.ensureDirectoryExists(this.baseDir).catch((err) => {
      logger.error(
        { baseDir: this.baseDir, error: err },
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
    if (!storageId || typeof storageId !== "string") {
      throw new Error(
        `Invalid storageId: Expected non-empty string, received: ${typeof storageId} (${storageId})`,
      );
    }

    const safeStorageId = path
      .normalize(storageId)
      .replace(/^(\.\.(\/|\\|$))+/, "");
    if (path.isAbsolute(safeStorageId) || safeStorageId.includes("..")) {
      throw new Error("Invalid storageId: Path traversal detected.");
    }
    return path.join(this.baseDir, safeStorageId);
  }

  // Legacy method for backward compatibility
  private async generateStorageId(
    userId: string,
    contentType: string,
    subfolder: string,
  ): Promise<string> {
    const { nanoid } = await import("nanoid");
    const fileExtension = contentType.split("/").pop()?.split("+")[0] || "bin";
    const uniqueFilename = `${nanoid()}.${fileExtension}`;
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
    const storageId = await this.generateStorageId(
      userId,
      contentType,
      subfolder,
    );
    const fullPath = this.getFullPath(storageId);
    const dirPath = path.dirname(fullPath);

    await this.ensureDirectoryExists(dirPath);

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(fullPath);
      fileStream.pipe(writeStream);
      writeStream.on("finish", () => resolve({ storageId }));
      writeStream.on("error", (error) => {
        fsPromises.unlink(fullPath).catch(() => {}); // Cleanup
        reject(new Error(`Worker failed to store file: ${error.message}`));
      });
      fileStream.on("error", (error) => {
        writeStream.end();
        fsPromises.unlink(fullPath).catch(() => {}); // Cleanup
        reject(
          new Error(`Worker failed to read upload stream: ${error.message}`),
        );
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
          "Worker asset saved successfully",
        );
        resolve({ storageId });
      });
      writeStream.on("error", (error) => {
        fsPromises.unlink(fullPath).catch(() => {}); // Cleanup
        reject(
          new Error(`Worker failed to store asset file: ${error.message}`),
        );
      });
      fileStream.on("error", (error) => {
        writeStream.end();
        fsPromises.unlink(fullPath).catch(() => {}); // Cleanup
        reject(
          new Error(
            `Worker failed to read asset upload stream: ${error.message}`,
          ),
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
        fsPromises.unlink(fullPath).catch(() => {}); // Cleanup
        reject(new Error(`Worker failed to store buffer: ${error.message}`));
      });
      readStream.on("error", (error) => {
        writeStream.end();
        fsPromises.unlink(fullPath).catch(() => {}); // Cleanup
        reject(
          new Error(`Worker failed to read buffer stream: ${error.message}`),
        );
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
      "Worker asset buffer saved successfully",
    );
    return { storageId };
  }

  async getStream(storageId: string): Promise<GetObjectOutput> {
    const fullPath = this.getFullPath(storageId);
    try {
      await fsPromises.access(fullPath, fs.constants.R_OK);
      const stats = await fsPromises.stat(fullPath);
      const stream = fs.createReadStream(fullPath);
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
        "Worker asset folder deleted successfully",
      );
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        logger.error(
          { userId, assetType, assetId, error: error.message },
          "Worker failed to delete asset folder",
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
}

export const objectStorage = new LocalObjectStorage(WORKER_BASE_STORAGE_DIR);

// Helper functions for common asset file names (same as backend)
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
