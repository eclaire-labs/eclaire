/**
 * Memory estimation for llama.cpp inference
 *
 * Estimates GPU memory requirements for running local LLM models.
 *
 * Memory formula:
 * 1. Model weights ≈ file size (source.sizeBytes)
 * 2. KV cache ≈ proportional to context size and model size
 * 3. Compute buffers ≈ 500 MB overhead
 *
 * KNOWN LIMITATION: Sliding Window Attention (SWA)
 * Models like Gemma3 use SWA where only some layers use full context
 * and others use a small sliding window (e.g., 1024 tokens).
 * This dramatically reduces actual KV cache memory:
 *   - Gemma3 at 131K context: Estimated ~20 GB, Actual ~6 GB
 *   - Qwen3 at 40K context: Estimated ~15 GB, Actual ~15 GB (no SWA)
 *
 * Our estimates are conservative (overestimate) for SWA models.
 * For accurate SWA estimation, we would need:
 *   - slidingWindow: window size in tokens
 *   - slidingWindowPattern: which layers use full vs windowed attention
 */

import { detectVRAM, formatBytes, type VRAMStatus } from './vram.js';

/**
 * Memory estimation for a model configuration
 */
export interface MemoryEstimate {
  modelWeights: number; // bytes
  kvCache: number; // bytes
  computeBuffers: number; // bytes
  visionOverhead: number; // bytes (mmproj weights + runtime buffers)
  total: number; // bytes
  totalGB: number; // for display
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Model architecture info for accurate KV cache estimation
 */
export interface ModelArchitectureInput {
  layers: number;
  kvHeads: number;
  headDim?: number;
  slidingWindow?: number;
  slidingWindowPattern?: number;
}

/**
 * Input for memory estimation
 */
export interface ModelMemoryInput {
  sizeBytes?: number;
  visionSizeBytes?: number; // Size of mmproj file for vision models
  contextSize: number;
  quantization?: string;
  modelId?: string;
  architecture?: ModelArchitectureInput;
}

/**
 * Result of memory requirements check
 */
export interface MemoryCheckResult {
  status: 'ok' | 'warning' | 'danger';
  availableVRAM: number;
  requiredVRAM: number;
  headroom: number; // bytes remaining (can be negative)
  message: string;
  vramStatus: VRAMStatus;
  details: {
    backend?: MemoryEstimate & { modelId?: string };
    workers?: MemoryEstimate & { modelId?: string };
  };
}

// Constants
const COMPUTE_BUFFER_OVERHEAD = 500 * 1024 * 1024; // 500 MB
const BASE_KV_CACHE_7B_32K = 3 * 1024 * 1024 * 1024; // ~3 GB for 7B model at 32K context
const VISION_BUFFER_MIN = 256 * 1024 * 1024; // 256 MB minimum vision runtime buffer
const VISION_BUFFER_RATIO = 0.20; // 20% of mmproj size for runtime buffers

/**
 * Estimate KV cache using accurate formula when architecture is known
 *
 * Formula: 2 × n_layers × n_kv_heads × head_dim × context × 2 bytes (f16)
 *
 * The factor of 2 at the start is for K and V caches.
 * The factor of 2 at the end is for f16 (2 bytes per element).
 *
 * For SWA (Sliding Window Attention) models like Gemma3:
 * - Some layers use full context (every Nth layer based on slidingWindowPattern)
 * - Other layers use a small sliding window (e.g., 1024 tokens)
 * This dramatically reduces KV cache size.
 */
function estimateKVCacheWithArchitecture(
  contextSize: number,
  layers: number,
  kvHeads: number,
  headDim: number = 128,
  slidingWindow?: number,
  slidingWindowPattern?: number
): number {
  // Check if this is an SWA model
  if (slidingWindow && slidingWindowPattern && slidingWindowPattern > 1) {
    // SWA model: calculate per-layer context usage
    // Every Nth layer (slidingWindowPattern) uses full context
    // Other layers use the sliding window
    const fullContextLayers = Math.ceil(layers / slidingWindowPattern);
    const swaLayers = layers - fullContextLayers;

    // Tokens per layer type
    const fullContextTokens = fullContextLayers * contextSize;
    const swaTokens = swaLayers * Math.min(slidingWindow, contextSize);
    const totalTokens = fullContextTokens + swaTokens;

    // KV cache = 2 (K+V) × total_tokens × kv_heads × head_dim × 2 (f16 bytes)
    return 2 * totalTokens * kvHeads * headDim * 2;
  }

  // Non-SWA: all layers use full context
  // KV cache = 2 (K+V) × layers × kv_heads × head_dim × context × 2 (f16 bytes)
  return 2 * layers * kvHeads * headDim * contextSize * 2;
}

/**
 * Estimate KV cache using model size as proxy (fallback when architecture unknown)
 *
 * Calibrated against llama.cpp actual usage:
 * - Qwen3-14B at 40960 context: ~6.4 GB KV cache
 * - 7B model at 32K context: ~3 GB KV cache
 *
 * Uses a higher multiplier (4.5x instead of 3x) to be more conservative.
 */
function estimateKVCacheFallback(contextSize: number, modelSizeGB: number): number {
  const contextScale = contextSize / 32768;
  const modelScale = modelSizeGB / 7;

  // Use 4.5 GB base (more conservative than 3 GB) to account for larger architectures
  const baseKVCache = 4.5 * 1024 * 1024 * 1024;
  return Math.round(baseKVCache * contextScale * modelScale);
}

/**
 * Estimate vision overhead for multimodal models
 *
 * Formula: visionOverhead = mmprojWeights + max(256 MiB, 0.20 × mmprojWeights)
 *
 * The runtime buffer estimate is conservative to avoid false "fits" that OOM.
 * Based on llama.cpp observations:
 * - Gemma3 4B vision: 812 MiB mmproj + 121 MiB compute = 933 MiB actual
 * - Our estimate: 812 + max(256, 162) = 812 + 256 = 1068 MiB (~14% headroom)
 */
function estimateVisionOverhead(visionSizeBytes: number): number {
  const runtimeBuffers = Math.max(VISION_BUFFER_MIN, visionSizeBytes * VISION_BUFFER_RATIO);
  return visionSizeBytes + runtimeBuffers;
}

/**
 * Estimate memory requirements for a single model
 *
 * @param sizeBytes - Model file size in bytes
 * @param contextSize - Context window size in tokens
 * @param architecture - Optional architecture info for accurate KV cache estimation
 * @param visionSizeBytes - Optional vision projector (mmproj) file size for multimodal models
 */
export function estimateModelMemory(
  sizeBytes: number | undefined,
  contextSize: number,
  architecture?: ModelArchitectureInput,
  visionSizeBytes?: number
): MemoryEstimate {
  // If no size info, return low confidence estimate
  if (!sizeBytes || sizeBytes === 0) {
    return {
      modelWeights: 0,
      kvCache: 0,
      computeBuffers: COMPUTE_BUFFER_OVERHEAD,
      visionOverhead: 0,
      total: COMPUTE_BUFFER_OVERHEAD,
      totalGB: COMPUTE_BUFFER_OVERHEAD / (1024 * 1024 * 1024),
      confidence: 'low',
    };
  }

  const modelWeights = sizeBytes;
  const modelSizeGB = sizeBytes / (1024 * 1024 * 1024);
  const computeBuffers = COMPUTE_BUFFER_OVERHEAD;

  let kvCache: number;
  let confidence: 'high' | 'medium' | 'low';

  if (architecture && architecture.layers && architecture.kvHeads) {
    // Use accurate formula with architecture info
    kvCache = estimateKVCacheWithArchitecture(
      contextSize,
      architecture.layers,
      architecture.kvHeads,
      architecture.headDim ?? 128,
      architecture.slidingWindow,
      architecture.slidingWindowPattern
    );
    confidence = 'high';
  } else {
    // Fallback to size-based estimation
    kvCache = estimateKVCacheFallback(contextSize, modelSizeGB);
    confidence = 'medium';
  }

  // Calculate vision overhead if this is a multimodal model
  const visionOverhead = visionSizeBytes ? estimateVisionOverhead(visionSizeBytes) : 0;

  const total = modelWeights + kvCache + computeBuffers + visionOverhead;

  return {
    modelWeights,
    kvCache,
    computeBuffers,
    visionOverhead,
    total,
    totalGB: total / (1024 * 1024 * 1024),
    confidence,
  };
}

/**
 * Estimate total memory for running both contexts
 */
export function estimateTotalMemory(
  backendModel: ModelMemoryInput | null,
  workersModel: ModelMemoryInput | null
): {
  total: number;
  backend?: MemoryEstimate;
  workers?: MemoryEstimate;
} {
  let total = 0;
  let backend: MemoryEstimate | undefined;
  let workers: MemoryEstimate | undefined;

  if (backendModel) {
    backend = estimateModelMemory(
      backendModel.sizeBytes,
      backendModel.contextSize,
      backendModel.architecture,
      backendModel.visionSizeBytes
    );
    total += backend.total;
  }

  if (workersModel) {
    workers = estimateModelMemory(
      workersModel.sizeBytes,
      workersModel.contextSize,
      workersModel.architecture,
      workersModel.visionSizeBytes
    );
    total += workers.total;
  }

  return { total, backend, workers };
}

/**
 * Check if there's enough VRAM for the requested configuration
 */
export async function checkMemoryRequirements(
  backendModel: ModelMemoryInput | null,
  workersModel: ModelMemoryInput | null
): Promise<MemoryCheckResult> {
  // Detect available VRAM
  const vramStatus = await detectVRAM();
  const availableVRAM = vramStatus.availableVRAM;

  // Estimate memory requirements
  const { total, backend, workers } = estimateTotalMemory(backendModel, workersModel);
  const headroom = availableVRAM - total;

  // Determine status
  let status: 'ok' | 'warning' | 'danger';
  let message: string;

  if (total === 0) {
    // No models configured or no size info
    status = 'ok';
    message = 'No memory estimation available (model size unknown)';
  } else if (headroom >= 2 * 1024 * 1024 * 1024) {
    // At least 2 GB headroom
    status = 'ok';
    message = `Sufficient VRAM available (${formatBytes(headroom)} headroom)`;
  } else if (headroom >= 0) {
    // Tight but possible
    status = 'warning';
    message = `Tight on VRAM - only ${formatBytes(headroom)} headroom`;
  } else {
    // Not enough
    status = 'warning';
    message = `Estimated memory (${formatBytes(total)}) exceeds available VRAM (${formatBytes(availableVRAM)})`;
  }

  return {
    status,
    availableVRAM,
    requiredVRAM: total,
    headroom,
    message,
    vramStatus,
    details: {
      backend: backend
        ? { ...backend, modelId: backendModel?.modelId }
        : undefined,
      workers: workers
        ? { ...workers, modelId: workersModel?.modelId }
        : undefined,
    },
  };
}

/**
 * Format memory size for display (e.g., "8.53 GB")
 */
export function formatMemorySize(bytes: number): string {
  return formatBytes(bytes);
}

/**
 * Format memory estimate as a detailed breakdown string
 */
export function formatMemoryBreakdown(
  estimate: MemoryEstimate,
  label: string
): string[] {
  const lines: string[] = [];

  if (estimate.confidence === 'low') {
    lines.push(`  ${label}: Unknown (model size not available)`);
    return lines;
  }

  lines.push(`  ${label}:`);
  lines.push(`    Model weights:    ${formatBytes(estimate.modelWeights)}`);
  lines.push(`    KV cache:         ${formatBytes(estimate.kvCache)}`);
  lines.push(`    Compute buffers:  ${formatBytes(estimate.computeBuffers)}`);
  if (estimate.visionOverhead > 0) {
    lines.push(`    Vision overhead:  ${formatBytes(estimate.visionOverhead)}`);
  }
  lines.push(`    ───────────────────────`);
  lines.push(`    Subtotal:         ${formatBytes(estimate.total)}`);

  return lines;
}
