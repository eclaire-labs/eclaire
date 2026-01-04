/**
 * GPU VRAM detection for macOS Metal
 *
 * Uses system_profiler to detect GPU memory. For Apple Silicon Macs,
 * this reports unified memory which is shared between CPU and GPU.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

// Cache VRAM detection result for session
let cachedVRAMStatus: VRAMStatus | null = null;

// Fallback ratio if llama-cli is not available (approximate match to Metal API)
const UNIFIED_MEMORY_GPU_RATIO_FALLBACK = 0.68;

/**
 * Query Metal's recommendedMaxWorkingSetSize via llama-cli
 *
 * Running llama-cli without args outputs Metal device info before erroring.
 * We parse the recommendedMaxWorkingSetSize from that output.
 */
async function getMetalRecommendedMemory(): Promise<number | null> {
  try {
    // llama-cli outputs Metal info to stderr before failing with "error: --model is required"
    // We capture both stdout and stderr since the output goes to stderr
    const { stdout, stderr } = await execAsync('llama-cli 2>&1', {
      timeout: 5000,
    });

    const output = stdout + stderr;

    // Parse: "recommendedMaxWorkingSetSize  = 22906.50 MB"
    const match = output.match(/recommendedMaxWorkingSetSize\s*=\s*([\d.]+)\s*MB/);
    if (match && match[1]) {
      const mb = parseFloat(match[1]);
      return mb * 1024 * 1024; // Convert MB to bytes
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * GPU information from system detection
 */
export interface GPUInfo {
  name: string;
  vramBytes: number;
  vramGB: number;
  isUnifiedMemory: boolean;
  isAppleSilicon: boolean;
}

/**
 * VRAM detection result
 */
export interface VRAMStatus {
  totalVRAM: number; // bytes
  availableVRAM: number; // bytes (estimated after system reservation)
  gpus: GPUInfo[];
}

/**
 * Detect GPU VRAM on the system
 *
 * On macOS, uses system_profiler SPDisplaysDataType to query GPU info.
 * For Apple Silicon, uses unified memory (total system RAM).
 */
export async function detectVRAM(): Promise<VRAMStatus> {
  // Return cached result if available
  if (cachedVRAMStatus) {
    return cachedVRAMStatus;
  }

  if (process.platform !== 'darwin') {
    throw new Error('VRAM detection is currently only supported on macOS');
  }

  try {
    const { stdout } = await execAsync('system_profiler SPDisplaysDataType -json', {
      timeout: 10000,
    });

    const data = JSON.parse(stdout);
    const gpus = parseSystemProfilerData(data);

    const primaryGPU = gpus[0];
    if (!primaryGPU) {
      throw new Error('No GPU detected');
    }

    // Calculate total VRAM (use the primary GPU)
    const totalVRAM = primaryGPU.vramBytes;

    let availableVRAM: number;

    if (primaryGPU.isUnifiedMemory) {
      // Try to get actual Metal recommendedMaxWorkingSetSize via llama-cli
      const metalRecommended = await getMetalRecommendedMemory();
      if (metalRecommended) {
        availableVRAM = metalRecommended;
      } else {
        // Fallback: use 68% of total (approximate match to Metal API)
        availableVRAM = Math.floor(totalVRAM * UNIFIED_MEMORY_GPU_RATIO_FALLBACK);
      }
    } else {
      // Discrete GPU: keep existing 512MB reservation
      availableVRAM = Math.max(0, totalVRAM - 512 * 1024 * 1024);
    }

    cachedVRAMStatus = {
      totalVRAM,
      availableVRAM,
      gpus,
    };

    return cachedVRAMStatus;
  } catch (error: any) {
    // Fallback: try to detect Apple Silicon via chip name
    const fallback = await detectAppleSiliconFallback();
    if (fallback) {
      cachedVRAMStatus = fallback;
      return fallback;
    }

    throw new Error(`Failed to detect VRAM: ${error.message}`);
  }
}

/**
 * Parse system_profiler SPDisplaysDataType JSON output
 */
function parseSystemProfilerData(data: any): GPUInfo[] {
  const gpus: GPUInfo[] = [];

  const displays = data.SPDisplaysDataType;
  if (!Array.isArray(displays)) {
    return gpus;
  }

  for (const display of displays) {
    const name = display.sppci_model || display._name || 'Unknown GPU';
    const isAppleSilicon = isAppleSiliconChip(name);
    const isUnifiedMemory = isAppleSilicon;

    let vramBytes = 0;

    if (isAppleSilicon) {
      // Apple Silicon uses unified memory - use total system RAM
      vramBytes = os.totalmem();
    } else {
      // Discrete GPU - parse VRAM from spdisplays_vram or similar fields
      const vramString =
        display.spdisplays_vram ||
        display.sppci_vram ||
        display._spdisplays_vram ||
        '';

      vramBytes = parseVRAMString(vramString);
    }

    if (vramBytes > 0) {
      gpus.push({
        name,
        vramBytes,
        vramGB: vramBytes / (1024 * 1024 * 1024),
        isUnifiedMemory,
        isAppleSilicon,
      });
    }
  }

  return gpus;
}

/**
 * Check if GPU name indicates Apple Silicon
 */
function isAppleSiliconChip(name: string): boolean {
  const lowerName = name.toLowerCase();
  return (
    lowerName.includes('apple m1') ||
    lowerName.includes('apple m2') ||
    lowerName.includes('apple m3') ||
    lowerName.includes('apple m4') ||
    lowerName.includes('apple gpu')
  );
}

/**
 * Parse VRAM string like "16 GB" or "8192 MB" to bytes
 */
function parseVRAMString(vramString: string): number {
  if (!vramString) return 0;

  const match = vramString.match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i);
  if (!match || !match[1] || !match[2]) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  switch (unit) {
    case 'TB':
      return value * 1024 * 1024 * 1024 * 1024;
    case 'GB':
      return value * 1024 * 1024 * 1024;
    case 'MB':
      return value * 1024 * 1024;
    default:
      return 0;
  }
}

/**
 * Fallback detection for Apple Silicon using sysctl
 */
async function detectAppleSiliconFallback(): Promise<VRAMStatus | null> {
  try {
    // Check if we're on Apple Silicon
    const { stdout: archOutput } = await execAsync('uname -m');
    const arch = archOutput.trim();

    if (arch !== 'arm64') {
      return null;
    }

    // Get chip name via sysctl
    let chipName = 'Apple Silicon';
    try {
      const { stdout: chipOutput } = await execAsync(
        'sysctl -n machdep.cpu.brand_string'
      );
      chipName = chipOutput.trim() || 'Apple Silicon';
    } catch {
      // Ignore - use default name
    }

    const totalMem = os.totalmem();

    // Try to get actual Metal recommendedMaxWorkingSetSize via llama-cli
    const metalRecommended = await getMetalRecommendedMemory();
    const availableVRAM = metalRecommended
      ? metalRecommended
      : Math.floor(totalMem * UNIFIED_MEMORY_GPU_RATIO_FALLBACK);

    return {
      totalVRAM: totalMem,
      availableVRAM,
      gpus: [
        {
          name: chipName,
          vramBytes: totalMem,
          vramGB: totalMem / (1024 * 1024 * 1024),
          isUnifiedMemory: true,
          isAppleSilicon: true,
        },
      ],
    };
  } catch {
    return null;
  }
}

/**
 * Clear the cached VRAM status (useful for testing)
 */
export function clearVRAMCache(): void {
  cachedVRAMStatus = null;
}

/**
 * Format bytes as human-readable string (e.g., "22.91 GB")
 */
export function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}
