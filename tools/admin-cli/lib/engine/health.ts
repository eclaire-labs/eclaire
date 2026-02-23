/**
 * Health check utilities for engine management
 */

import {
  getActiveModelIdForContext,
  getModelConfigById,
  parsePort,
} from "@eclaire/ai";
import axios from "axios";
import { exec } from "child_process";
import * as fs from "fs";
import * as os from "os";
import { promisify } from "util";
import type { DoctorCheck } from "../types/engines.js";
import { estimateModelMemory } from "./memory.js";
import { getServerStatus, resolveSelectionEngine } from "./process.js";
import { detectVRAM } from "./vram.js";

const execAsync = promisify(exec);

// ============================================================================
// Server health checks
// ============================================================================

/**
 * Check if a server is healthy by hitting its health endpoint
 */
export async function checkServerHealth(port: number): Promise<boolean> {
  try {
    const response = await axios.get(`http://127.0.0.1:${port}/health`, {
      timeout: 2000,
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Wait for a server to become healthy
 */
export async function waitForHealthy(
  baseUrl: string,
  timeoutMs: number = 30000,
): Promise<boolean> {
  const startTime = Date.now();
  const checkInterval = 500; // ms

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await axios.get(`${baseUrl}/health`, {
        timeout: 2000,
      });
      if (response.status === 200) {
        return true;
      }
    } catch {
      // Server not ready yet, continue waiting
    }
    await sleep(checkInterval);
  }

  return false;
}

/**
 * Check if a port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  try {
    // Try to connect to the port
    await axios.get(`http://127.0.0.1:${port}`, {
      timeout: 500,
    });
    // If we get a response, port is in use
    return false;
  } catch (error: any) {
    // ECONNREFUSED means nothing is listening - port is available
    if (error.code === "ECONNREFUSED") {
      return true;
    }
    // Any other response means something is listening
    return false;
  }
}

// ============================================================================
// Doctor checks
// ============================================================================

/**
 * Run all doctor checks
 */
export async function runDoctorChecks(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  // Check llama-server binary
  checks.push(await checkLlamaServerBinary());

  // Check managed providers configuration
  checks.push(await checkManagedProviders());

  // Check models for each context
  const modelChecks = await checkModelsExist();
  checks.push(...modelChecks);

  // Check ports for managed providers
  const portChecks = await checkPortsAvailable();
  checks.push(...portChecks);

  // Check GPU memory
  checks.push(await checkGPUMemory());

  return checks;
}

/**
 * Check if llama-server binary is available
 */
async function checkLlamaServerBinary(): Promise<DoctorCheck> {
  const binary = "llama-server";

  try {
    const { stdout } = await execAsync(`which ${binary}`);
    const binaryPath = stdout.trim();

    // Try to get version
    try {
      await execAsync(`${binary} --version`);
    } catch {
      // --version might not work, but binary exists
    }

    return {
      name: "llama-server binary",
      status: "pass",
      message: `Found at ${binaryPath}`,
    };
  } catch {
    return {
      name: "llama-server binary",
      status: "fail",
      message: `'${binary}' not found in PATH`,
      fix: "Install llama.cpp: brew install llama.cpp (macOS) or build from source",
    };
  }
}

/**
 * Check if managed llama-cpp engine is configured via selection.json
 */
async function checkManagedProviders(): Promise<DoctorCheck> {
  try {
    const resolution = resolveSelectionEngine();

    if (resolution.status === "no-managed") {
      return {
        name: "Managed engine",
        status: "warn",
        message: "No managed llama-cpp models in selection.json",
        fix: "Select a model that uses a managed llama-cpp provider",
      };
    }

    if (resolution.status === "conflict") {
      return {
        name: "Managed engine",
        status: "fail",
        message: resolution.message,
        fix: "Update selection.json to use models from the same managed provider",
      };
    }

    const modelCount = resolution.modelsToPreload.length;
    const modelIds = resolution.modelsToPreload
      .map((m) => m.modelId)
      .join(", ");
    return {
      name: "Managed engine",
      status: "pass",
      message: `${modelCount} model(s) configured: ${modelIds}`,
    };
  } catch (error: any) {
    return {
      name: "Managed engine",
      status: "fail",
      message: error.message,
      fix: "Check config/ai/*.json for syntax errors",
    };
  }
}

/**
 * Check if models are configured for active contexts
 */
async function checkModelsExist(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const contexts: Array<"backend" | "workers"> = ["backend", "workers"];

  for (const context of contexts) {
    const modelId = getActiveModelIdForContext(context);

    if (!modelId) {
      checks.push({
        name: `Model for ${context}`,
        status: "warn",
        message: "No active model configured",
        fix: `Run: eclaire model activate --${context} <model-id>`,
      });
      continue;
    }

    const model = getModelConfigById(modelId);
    if (!model) {
      checks.push({
        name: `Model for ${context}`,
        status: "fail",
        message: `Model '${modelId}' not found in models.json`,
        fix: `Add the model to models.json or choose a different model`,
      });
      continue;
    }

    // Check if model has a local path
    const source = model.source;
    if (!source?.localPath) {
      checks.push({
        name: `Model for ${context}`,
        status: "warn",
        message: `${modelId} configured but no local path set`,
        fix: `Run: eclaire engine pull ${modelId}`,
      });
      continue;
    }

    // Check if file exists
    if (!fs.existsSync(source.localPath)) {
      checks.push({
        name: `Model for ${context}`,
        status: "fail",
        message: `File not found: ${source.localPath}`,
        fix: `Run: eclaire engine pull ${modelId}`,
      });
      continue;
    }

    checks.push({
      name: `Model for ${context}`,
      status: "pass",
      message: `${modelId} ready`,
    });
  }

  return checks;
}

/**
 * Check if the engine port is available
 */
async function checkPortsAvailable(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const resolution = resolveSelectionEngine();

  // Only check port if we have a configured provider
  if (resolution.status !== "ok" || !resolution.providerConfig) {
    return checks;
  }

  const port = parsePort(resolution.providerConfig.baseUrl);
  const status = getServerStatus(resolution.providerConfig);

  if (status.running) {
    checks.push({
      name: `Port ${port} (llama-cpp)`,
      status: "pass",
      message: `In use by managed server (PID: ${status.pid})`,
    });
  } else {
    const available = await isPortAvailable(port);
    if (available) {
      checks.push({
        name: `Port ${port} (llama-cpp)`,
        status: "pass",
        message: "Available",
      });
    } else {
      checks.push({
        name: `Port ${port} (llama-cpp)`,
        status: "warn",
        message: "In use by another process",
        fix: `Stop the process using port ${port} or change the baseUrl in providers.json`,
      });
    }
  }

  return checks;
}

/**
 * Check GPU VRAM availability
 */
async function checkGPUMemory(): Promise<DoctorCheck> {
  try {
    const vramStatus = await detectVRAM();
    const gpu = vramStatus.gpus[0];
    const gpuName = gpu?.name || "Unknown GPU";
    const memoryType = gpu?.isUnifiedMemory ? "unified" : "dedicated";
    const availableGB = vramStatus.availableVRAM / (1024 * 1024 * 1024);
    const totalGB = vramStatus.totalVRAM / (1024 * 1024 * 1024);

    // Estimate memory requirements for models in selection
    let requiredGB = 0;
    const resolution = resolveSelectionEngine();

    for (const modelInfo of resolution.modelsToPreload) {
      const model = modelInfo.modelConfig;
      if (!model?.source?.sizeBytes) continue;

      // Use model's context window (no longer from provider)
      const contextSize = model.capabilities?.contextWindow ?? 8192;

      const estimate = estimateModelMemory(
        model.source.sizeBytes,
        contextSize,
        model.source.architecture,
        model.source.visionSizeBytes,
      );
      requiredGB += estimate.totalGB;
    }

    if (requiredGB > 0 && requiredGB > availableGB) {
      return {
        name: "GPU memory",
        status: "warn",
        message: `${gpuName}: ${availableGB.toFixed(1)}GB available (${memoryType}), ~${requiredGB.toFixed(1)}GB required`,
        fix: "Consider using smaller models or reducing context size",
      };
    }

    if (requiredGB > 0) {
      return {
        name: "GPU memory",
        status: "pass",
        message: `${gpuName}: ${availableGB.toFixed(1)}GB available (${memoryType}), ~${requiredGB.toFixed(1)}GB required`,
      };
    }

    return {
      name: "GPU memory",
      status: "pass",
      message: `${gpuName}: ${totalGB.toFixed(1)}GB ${memoryType} memory`,
    };
  } catch (error: any) {
    // Fallback to system memory check if GPU detection fails
    const totalMemGB = os.totalmem() / (1024 * 1024 * 1024);
    const freeMemGB = os.freemem() / (1024 * 1024 * 1024);

    return {
      name: "System memory",
      status: "warn",
      message: `${freeMemGB.toFixed(1)}GB free of ${totalMemGB.toFixed(1)}GB total (GPU detection failed: ${error.message})`,
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
