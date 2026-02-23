/**
 * Path utilities for engine management
 *
 * Manages the ~/.eclaire directory structure:
 * ~/.eclaire/
 * ├── pids/       # PID files for running servers
 * ├── logs/       # Log files for servers
 * └── models/     # Downloaded model files
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Base directory for eclaire runtime files
const ECLAIRE_DIR = ".eclaire";

// ============================================================================
// Directory paths
// ============================================================================

/**
 * Get the eclaire home directory (~/.eclaire)
 */
export function getEclaireDir(): string {
  return path.join(os.homedir(), ECLAIRE_DIR);
}

/**
 * Get the PIDs directory (~/.eclaire/pids)
 */
export function getPidsDir(): string {
  return path.join(getEclaireDir(), "pids");
}

/**
 * Get the logs directory (~/.eclaire/logs)
 */
export function getLogsDir(): string {
  return path.join(getEclaireDir(), "logs");
}

/**
 * Get the models directory (~/.eclaire/models)
 */
export function getModelsDir(): string {
  return path.join(getEclaireDir(), "models");
}

// ============================================================================
// File paths
// ============================================================================

/**
 * Get the PID file path for a provider
 */
export function getPidFilePath(providerId: string): string {
  // Sanitize provider ID for use in filename
  const safeId = providerId.replace(/[^a-zA-Z0-9-_]/g, "_");
  return path.join(getPidsDir(), `${safeId}.pid`);
}

/**
 * Get the log file path for a provider
 */
export function getLogFilePath(providerId: string): string {
  // Sanitize provider ID for use in filename
  const safeId = providerId.replace(/[^a-zA-Z0-9-_]/g, "_");
  return path.join(getLogsDir(), `${safeId}.log`);
}

// ============================================================================
// Directory management
// ============================================================================

/**
 * Ensure all required directories exist
 */
export function ensureDirectories(): void {
  const dirs = [getEclaireDir(), getPidsDir(), getLogsDir(), getModelsDir()];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Check if a directory exists and is writable
 */
export function isDirectoryWritable(dir: string): boolean {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// PID file management
// ============================================================================

/**
 * Read PID from file
 */
export function readPidFile(providerId: string): number | null {
  const pidFile = getPidFilePath(providerId);

  if (!fs.existsSync(pidFile)) {
    return null;
  }

  try {
    const content = fs.readFileSync(pidFile, "utf-8").trim();
    const pid = parseInt(content, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * Write PID to file
 */
export function writePidFile(providerId: string, pid: number): void {
  ensureDirectories();
  const pidFile = getPidFilePath(providerId);
  fs.writeFileSync(pidFile, String(pid));
}

/**
 * Remove PID file
 */
export function removePidFile(providerId: string): void {
  const pidFile = getPidFilePath(providerId);
  if (fs.existsSync(pidFile)) {
    fs.unlinkSync(pidFile);
  }
}

/**
 * Check if a process with the given PID is running
 */
export function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if engine is running for a provider
 */
export function isEngineRunning(providerId: string): boolean {
  const pid = readPidFile(providerId);
  if (pid === null) {
    return false;
  }
  return isProcessRunning(pid);
}

// ============================================================================
// Log file management
// ============================================================================

/**
 * Get the last N lines from a log file
 */
export function getLogTail(providerId: string, lines: number = 50): string[] {
  const logFile = getLogFilePath(providerId);

  if (!fs.existsSync(logFile)) {
    return [];
  }

  try {
    const content = fs.readFileSync(logFile, "utf-8");
    const allLines = content.split("\n");
    return allLines.slice(-lines);
  } catch {
    return [];
  }
}

/**
 * Clear log file
 */
export function clearLogFile(providerId: string): void {
  const logFile = getLogFilePath(providerId);
  if (fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, "");
  }
}
