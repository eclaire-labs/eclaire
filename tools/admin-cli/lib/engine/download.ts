/**
 * Model download utilities
 *
 * Handles downloading models from HuggingFace.
 */

import axios from "axios";
import { exec, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import type { DownloadResult } from "../types/engines.js";
import { ensureDirectories, getModelsDir } from "./paths.js";

const execAsync = promisify(exec);

// ============================================================================
// Download functions
// ============================================================================

/**
 * Download a model from HuggingFace
 *
 * Supports two formats:
 * - repoId/filename: e.g., "unsloth/Qwen3-14B-GGUF/Qwen3-14B-Q4_K_XL.gguf"
 * - HuggingFace URL: e.g., "https://huggingface.co/unsloth/Qwen3-14B-GGUF/resolve/main/Qwen3-14B-Q4_K_XL.gguf"
 */
export async function downloadModel(
  modelRef: string,
  destDir?: string,
  onProgress?: (progress: {
    percent: number;
    downloaded: number;
    total: number;
  }) => void,
): Promise<DownloadResult> {
  const targetDir = destDir || getModelsDir();
  ensureDirectories();

  // Ensure target directory exists
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Parse the model reference
  const parsed = parseModelRef(modelRef);
  if (!parsed) {
    return {
      success: false,
      error: `Invalid model reference: ${modelRef}. Expected format: org/repo/filename.gguf or HuggingFace URL`,
    };
  }

  const { repoId, filename } = parsed;
  const localPath = path.join(targetDir, filename);

  // Check if file already exists
  if (fs.existsSync(localPath)) {
    const stats = fs.statSync(localPath);
    return {
      success: true,
      localPath,
      sizeBytes: stats.size,
    };
  }

  // Try huggingface-cli first (handles resume, progress, auth)
  const hfCliAvailable = await checkCommand("huggingface-cli");

  if (hfCliAvailable) {
    return downloadWithHFCli(repoId, filename, targetDir);
  }

  // Fallback to direct HTTP download
  return downloadDirect(repoId, filename, targetDir, onProgress);
}

/**
 * Check if a model file exists locally
 */
export function isModelDownloaded(filename: string, destDir?: string): boolean {
  const targetDir = destDir || getModelsDir();
  const localPath = path.join(targetDir, filename);
  return fs.existsSync(localPath);
}

/**
 * Get the local path for a model
 */
export function getLocalModelPath(filename: string, destDir?: string): string {
  const targetDir = destDir || getModelsDir();
  return path.join(targetDir, filename);
}

/**
 * List all downloaded models
 */
export function listDownloadedModels(destDir?: string): string[] {
  const targetDir = destDir || getModelsDir();

  if (!fs.existsSync(targetDir)) {
    return [];
  }

  return fs
    .readdirSync(targetDir)
    .filter((file) => file.endsWith(".gguf") || file.endsWith(".bin"));
}

// ============================================================================
// Download implementations
// ============================================================================

/**
 * Download using huggingface-cli
 */
async function downloadWithHFCli(
  repoId: string,
  filename: string,
  destDir: string,
): Promise<DownloadResult> {
  const localPath = path.join(destDir, filename);

  return new Promise((resolve) => {
    const child = spawn(
      "huggingface-cli",
      [
        "download",
        repoId,
        filename,
        "--local-dir",
        destDir,
        "--local-dir-use-symlinks",
        "False",
      ],
      {
        stdio: "inherit", // Show progress in terminal
      },
    );

    child.on("error", (error) => {
      resolve({
        success: false,
        error: `huggingface-cli failed: ${error.message}`,
      });
    });

    child.on("exit", (code) => {
      if (code === 0) {
        const stats = fs.existsSync(localPath) ? fs.statSync(localPath) : null;
        resolve({
          success: true,
          localPath,
          sizeBytes: stats?.size,
        });
      } else {
        resolve({
          success: false,
          error: `huggingface-cli exited with code ${code}`,
        });
      }
    });
  });
}

/**
 * Download directly via HTTPS
 */
async function downloadDirect(
  repoId: string,
  filename: string,
  destDir: string,
  onProgress?: (progress: {
    percent: number;
    downloaded: number;
    total: number;
  }) => void,
): Promise<DownloadResult> {
  const url = `https://huggingface.co/${repoId}/resolve/main/${filename}`;
  const localPath = path.join(destDir, filename);
  const tempPath = localPath + ".downloading";

  try {
    const response = await axios({
      method: "GET",
      url,
      responseType: "stream",
      headers: {
        "User-Agent": "eclaire-cli/1.0.0",
      },
    });

    const totalSize = parseInt(response.headers["content-length"] || "0", 10);
    let downloadedSize = 0;

    const writer = fs.createWriteStream(tempPath);

    response.data.on("data", (chunk: Buffer) => {
      downloadedSize += chunk.length;
      if (onProgress && totalSize > 0) {
        onProgress({
          percent: (downloadedSize / totalSize) * 100,
          downloaded: downloadedSize,
          total: totalSize,
        });
      }
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", () => {
        // Rename temp file to final path
        fs.renameSync(tempPath, localPath);
        const stats = fs.statSync(localPath);
        resolve({
          success: true,
          localPath,
          sizeBytes: stats.size,
        });
      });

      writer.on("error", (error) => {
        // Clean up temp file
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        reject(error);
      });
    });
  } catch (error: any) {
    // Clean up temp file
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

    if (error.response?.status === 404) {
      return {
        success: false,
        error: `Model not found: ${url}`,
      };
    }

    return {
      success: false,
      error: `Download failed: ${error.message}`,
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

interface ParsedModelRef {
  repoId: string;
  filename: string;
}

/**
 * Parse a model reference into repoId and filename
 *
 * Supports:
 * - "org/repo/filename.gguf" -> { repoId: "org/repo", filename: "filename.gguf" }
 * - "https://huggingface.co/org/repo/resolve/main/filename.gguf" -> { repoId: "org/repo", filename: "filename.gguf" }
 */
function parseModelRef(ref: string): ParsedModelRef | null {
  // Handle HuggingFace URLs
  if (ref.startsWith("https://huggingface.co/")) {
    const match = ref.match(
      /huggingface\.co\/([^/]+\/[^/]+)\/resolve\/[^/]+\/(.+)$/,
    );
    if (match && match[1] && match[2]) {
      return {
        repoId: match[1],
        filename: match[2],
      };
    }
    return null;
  }

  // Handle path-style references: "org/repo/filename.gguf"
  const parts = ref.split("/");
  if (parts.length >= 3) {
    const filename = parts.pop()!;
    const repoId = parts.join("/");
    return { repoId, filename };
  }

  return null;
}

/**
 * Check if a command is available
 */
async function checkCommand(command: string): Promise<boolean> {
  try {
    await execAsync(`which ${command}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
