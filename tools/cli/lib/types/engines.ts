/**
 * Type definitions for engine management
 *
 * Note: Engine configuration is now part of ProviderConfig.engine in @eclaire/ai.
 * This file contains utility types used by engine commands.
 */

/**
 * Result of a doctor check
 */
export interface DoctorCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  fix?: string;
}

/**
 * Result of a model download
 */
export interface DownloadResult {
  success: boolean;
  localPath?: string;
  sizeBytes?: number;
  error?: string;
}

// ============================================================================
// VRAM and Memory Types (re-exported from modules for convenience)
// ============================================================================

// These types are defined in their respective modules:
// - GPUInfo, VRAMStatus: from ../engine/vram.ts
// - MemoryEstimate, MemoryCheckResult, ModelMemoryInput: from ../engine/memory.ts
//
// Import them directly from those modules for type safety.
