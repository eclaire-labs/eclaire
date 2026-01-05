/**
 * Process management for llama-server
 *
 * Handles starting, stopping, and monitoring llama-server processes.
 * Uses selection.json to determine which models to load into a single llama-server instance.
 */

import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import {
  getProviderConfig,
  getModelConfigById,
  loadSelectionConfiguration,
  parsePort,
  isManaged,
  type ProviderConfig,
  type ModelConfig,
} from '@eclaire/ai';
import {
  ensureDirectories,
  getPidFilePath,
  getLogFilePath,
  writePidFile,
  removePidFile,
  readPidFile,
  isProcessRunning,
  getModelsDir,
} from './paths.js';
import axios from 'axios';

// ============================================================================
// Constants
// ============================================================================

/** Fixed engine ID for PID and log files */
export const LLAMA_CPP_ENGINE_ID = 'llama-cpp';

// ============================================================================
// Types
// ============================================================================

export interface EngineStartOptions {
  hfModels: string[];
  providerConfig: ProviderConfig;
  foreground?: boolean;
}

export interface EngineStatus {
  running: boolean;
  pid: number | null;
  port: number | null;
}

/** Result of resolving which models need to be loaded */
export interface ManagedEngineResolution {
  status: 'ok' | 'no-managed' | 'conflict';
  message: string;
  providerId?: string;
  providerConfig?: ProviderConfig;
  modelsToPreload: Array<{
    modelId: string;
    context: string;
    providerModel: string;
    modelConfig: ModelConfig;
  }>;
}

// ============================================================================
// Selection Resolution
// ============================================================================

/**
 * Resolve which models need to be loaded into the managed llama-cpp engine.
 *
 * Reads selection.json and finds all models that use a managed llama-cpp provider.
 * Validates that all such models use the SAME provider.
 */
export function resolveSelectionEngine(): ManagedEngineResolution {
  // Load selection configuration
  const selection = loadSelectionConfiguration();

  // Collect models using managed llama-cpp providers
  const managedModels: Array<{
    context: string;
    modelId: string;
    modelConfig: ModelConfig;
    providerId: string;
    providerConfig: ProviderConfig;
  }> = [];

  for (const [context, modelId] of Object.entries(selection.active)) {
    if (!modelId) continue;

    const modelConfig = getModelConfigById(modelId);
    if (!modelConfig) continue;

    const providerConfig = getProviderConfig(modelConfig.provider);
    if (!providerConfig) continue;

    // Check if this is a managed llama-cpp provider
    if (
      providerConfig.engine?.managed === true &&
      providerConfig.engine?.name === 'llama-cpp'
    ) {
      managedModels.push({
        context,
        modelId,
        modelConfig,
        providerId: modelConfig.provider,
        providerConfig,
      });
    }
  }

  // No managed models found
  if (managedModels.length === 0) {
    return {
      status: 'no-managed',
      message: 'No managed llama-cpp models configured in selection.json',
      modelsToPreload: [],
    };
  }

  // Check all models use the same provider
  const providerIds = [...new Set(managedModels.map(m => m.providerId))];
  if (providerIds.length > 1) {
    return {
      status: 'conflict',
      message: `Multiple managed llama-cpp providers found: ${providerIds.join(', ')}. ` +
               `All active models must use the same managed provider.`,
      modelsToPreload: [],
    };
  }

  // Return OK result with models to preload
  // We know managedModels has at least one element because we checked length === 0 above
  const primary = managedModels[0]!;
  return {
    status: 'ok',
    message: `Found ${managedModels.length} model(s) to preload`,
    providerId: primary.providerId,
    providerConfig: primary.providerConfig,
    modelsToPreload: managedModels.map(m => ({
      modelId: m.modelId,
      context: m.context,
      providerModel: m.modelConfig.providerModel,
      modelConfig: m.modelConfig,
    })),
  };
}

// ============================================================================
// Validation (Legacy - kept for compatibility)
// ============================================================================

/**
 * Validate that a provider can be managed by the engine commands.
 * Returns an error message if invalid, null if valid.
 * @deprecated Use resolveSelectionEngine() instead
 */
export function validateManagedProvider(providerId: string): string | null {
  const provider = getProviderConfig(providerId);

  if (!provider) {
    return `Provider '${providerId}' not found in providers.json`;
  }

  if (!provider.engine) {
    return `Provider '${providerId}' has no engine configuration`;
  }

  if (!provider.engine.managed) {
    return `Provider '${providerId}' is not managed (managed: false)`;
  }

  if (provider.engine.name !== 'llama-cpp') {
    return `Provider '${providerId}' uses engine '${provider.engine.name}' which is not yet supported. Only 'llama-cpp' is currently supported.`;
  }

  return null;
}

/**
 * Get engine configuration from a provider
 * Returns undefined for unset values - llama-server has smart defaults:
 * - contextSize: 0 = load from model
 * - gpuLayers: auto
 * - flashAttention: auto
 * - batchSize: 2048
 */
export function getEngineSettings(provider: ProviderConfig): {
  port: number;
  gpuLayers?: number;
  contextSize?: number;
  batchSize?: number;
  flashAttention?: boolean;
  extraArgs: string[];
} {
  const engine = provider.engine!;
  return {
    port: parsePort(provider.baseUrl),
    gpuLayers: engine.gpuLayers,
    contextSize: engine.contextSize,
    batchSize: engine.batchSize,
    flashAttention: engine.flashAttention,
    extraArgs: engine.extraArgs ?? [],
  };
}

// ============================================================================
// Process lifecycle
// ============================================================================

/**
 * Start llama-server in router mode.
 *
 * - Empty hfModels: router mode, auto-discovers models from cache
 * - Single model: uses -hf to ensure model is downloaded/loaded
 * - Multiple models: router mode (models must be in cache already)
 *
 * @param options.hfModels - Array of HuggingFace model references (optional)
 * @param options.providerConfig - Provider configuration (for port and engine settings)
 * @param options.foreground - Run in foreground mode (default: false)
 */
export async function startLlamaServer(options: EngineStartOptions): Promise<number> {
  const { hfModels, providerConfig, foreground = false } = options;

  // Empty hfModels is valid: starts in router mode, auto-discovers models from cache
  const settings = getEngineSettings(providerConfig);

  // Ensure directories exist
  ensureDirectories();

  // Check if already running (using fixed engine ID)
  const existingPid = readPidFile(LLAMA_CPP_ENGINE_ID);
  if (existingPid && isProcessRunning(existingPid)) {
    throw new Error(`llama-cpp engine is already running (PID: ${existingPid})`);
  }

  // Clean up stale PID file if process is not running
  if (existingPid) {
    removePidFile(LLAMA_CPP_ENGINE_ID);
  }

  // Get binary (use default llama-server)
  const binary = 'llama-server';

  // Build command arguments
  const args = [
    '--port', String(settings.port),
    '--host', '127.0.0.1',
  ];

  // For router mode (multiple models), start without -hf and let llama-server
  // auto-discover from cache. For single model, use -hf to ensure it's loaded.
  // Note: Multiple -hf flags is deprecated; comma-separated -hf is for speculative decoding.
  if (hfModels.length === 1 && hfModels[0]) {
    args.push('-hf', hfModels[0]);
  }
  // When multiple models: start in router mode, models auto-discovered from cache

  // Only pass if explicitly configured (let llama-server use its defaults otherwise)
  if (settings.gpuLayers !== undefined) {
    args.push('-ngl', String(settings.gpuLayers));
  }
  if (settings.contextSize !== undefined) {
    args.push('-c', String(settings.contextSize));
  }
  if (settings.batchSize !== undefined) {
    args.push('-ub', String(settings.batchSize)); // -ub is ubatch-size, not -b
  }
  if (settings.flashAttention !== undefined) {
    args.push('-fa', settings.flashAttention ? 'on' : 'off');
  }

  if (settings.extraArgs.length > 0) {
    args.push(...settings.extraArgs);
  }

  // Log the command for debugging
  console.log(`\n  Command: ${binary} ${args.join(' ')}\n`);

  // Open log file for output (using fixed engine ID)
  const logFile = getLogFilePath(LLAMA_CPP_ENGINE_ID);
  const logStream = fs.openSync(logFile, 'a');

  // Track if process exited early
  let processExited = false;
  let exitCode: number | null = null;
  let exitErrorMsg: string | null = null;

  // Spawn the process
  const child: ChildProcess = spawn(binary, args, {
    detached: !foreground,
    stdio: foreground ? 'inherit' : ['ignore', logStream, logStream],
  });

  // Handle spawn errors
  if (!child.pid) {
    fs.closeSync(logStream);
    throw new Error(`Failed to start llama-server: no PID returned`);
  }

  // Listen for early exit (indicates startup failure)
  child.on('error', (err) => {
    processExited = true;
    exitErrorMsg = err.message;
  });

  child.on('exit', (code) => {
    processExited = true;
    exitCode = code;
  });

  // Write PID file (using fixed engine ID)
  writePidFile(LLAMA_CPP_ENGINE_ID, child.pid);

  // If not foreground, detach the process
  if (!foreground) {
    child.unref();
    fs.closeSync(logStream);
  }

  // Wait for server to be healthy, checking for early exit
  const healthUrl = `http://127.0.0.1:${settings.port}`;
  const startTime = Date.now();
  const timeout = 60000; // 60 seconds

  while (Date.now() - startTime < timeout) {
    // Check if process exited early (startup failure)
    if (processExited) {
      removePidFile(LLAMA_CPP_ENGINE_ID);
      if (exitErrorMsg) {
        throw new Error(`llama-server failed to start: ${exitErrorMsg}. Check logs: ${logFile}`);
      }
      throw new Error(`llama-server exited with code ${exitCode}. Check logs: ${logFile}`);
    }

    // Check if healthy
    const healthy = await checkHealthOnce(`${healthUrl}/health`);
    if (healthy) {
      return child.pid;
    }

    await sleep(500);
  }

  // Timeout - kill process and clean up
  try {
    process.kill(child.pid, 'SIGTERM');
  } catch {
    // Ignore error if process already dead
  }
  removePidFile(LLAMA_CPP_ENGINE_ID);
  throw new Error(`llama-server started but health check timed out. Check logs: ${logFile}`);
}

/**
 * Stop the llama-server instance.
 */
export async function stopLlamaServer(force: boolean = false): Promise<void> {
  const pid = readPidFile(LLAMA_CPP_ENGINE_ID);

  if (pid === null) {
    throw new Error(`llama-cpp engine is not running (no PID file)`);
  }

  if (!isProcessRunning(pid)) {
    // Process not running, just clean up PID file
    removePidFile(LLAMA_CPP_ENGINE_ID);
    throw new Error(`Process ${pid} not running. Cleaned up stale PID file.`);
  }

  // Send signal
  const signal = force ? 'SIGKILL' : 'SIGTERM';
  process.kill(pid, signal);

  // Wait for process to exit
  const exited = await waitForProcessExit(pid, force ? 1000 : 10000);

  if (!exited && !force) {
    // Force kill if graceful shutdown failed
    try {
      process.kill(pid, 'SIGKILL');
      await waitForProcessExit(pid, 2000);
    } catch {
      // Process may have exited between checks
    }
  }

  // Clean up PID file
  removePidFile(LLAMA_CPP_ENGINE_ID);
}

/**
 * Get the status of the llama-server instance.
 *
 * @param providerConfig - Optional provider config to get the port from
 */
export function getServerStatus(providerConfig?: ProviderConfig): EngineStatus {
  const pid = readPidFile(LLAMA_CPP_ENGINE_ID);

  // Get port from provider config if available
  const port = providerConfig ? parsePort(providerConfig.baseUrl) : null;

  if (pid === null) {
    return {
      running: false,
      pid: null,
      port,
    };
  }

  const running = isProcessRunning(pid);

  // Clean up stale PID file if process is not running
  if (!running) {
    removePidFile(LLAMA_CPP_ENGINE_ID);
  }

  return {
    running,
    pid: running ? pid : null,
    port,
  };
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Single health check (non-blocking)
 */
async function checkHealthOnce(url: string): Promise<boolean> {
  try {
    const response = await axios.get(url, { timeout: 2000 });
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Wait for a process to exit
 */
async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();
  const checkInterval = 100; // ms

  while (Date.now() - startTime < timeoutMs) {
    if (!isProcessRunning(pid)) {
      return true;
    }
    await sleep(checkInterval);
  }

  return !isProcessRunning(pid);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
