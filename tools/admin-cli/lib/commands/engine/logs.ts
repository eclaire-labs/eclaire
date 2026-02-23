/**
 * Engine logs command
 *
 * View logs for the llama-cpp engine.
 */

import * as fs from "node:fs";
import { getLogFilePath, getLogTail } from "../../engine/paths.js";
import { LLAMA_CPP_ENGINE_ID } from "../../engine/process.js";
import type { CommandOptions } from "../../types/index.js";
import { colors, icons } from "../../ui/colors.js";

interface LogsOptions extends CommandOptions {
  lines?: string;
  follow?: boolean;
}

export async function logsCommand(options: LogsOptions = {}): Promise<void> {
  try {
    const logFile = getLogFilePath(LLAMA_CPP_ENGINE_ID);
    const lines = parseInt(options.lines || "50", 10);

    // Check if log file exists
    if (!fs.existsSync(logFile)) {
      console.log(colors.warning(`${icons.warning} No log file found`));
      console.log(colors.dim(`  Expected at: ${logFile}`));
      console.log(colors.dim(`  Start the engine first: eclaire engine up`));
      return;
    }

    // Show log file path
    console.log(colors.header(`\n${icons.info} llama-cpp Engine Logs\n`));
    console.log(colors.dim(`File: ${logFile}`));
    console.log("");

    if (options.follow) {
      // Follow mode: tail -f equivalent
      await followLogs(logFile);
    } else {
      // Show last N lines
      const logLines = getLogTail(LLAMA_CPP_ENGINE_ID, lines);

      if (logLines.length === 0) {
        console.log(colors.dim("(empty log file)"));
      } else {
        for (const line of logLines) {
          console.log(formatLogLine(line));
        }
      }
    }

    console.log("");
  } catch (error: any) {
    console.log(
      colors.error(`${icons.error} Failed to read logs: ${error.message}`),
    );
    process.exit(1);
  }
}

/**
 * Follow log file in real-time (like tail -f)
 */
async function followLogs(logFile: string): Promise<void> {
  console.log(colors.dim("Press Ctrl+C to stop following logs...\n"));

  let lastSize = 0;
  const stats = fs.statSync(logFile);
  lastSize = stats.size;

  // Read initial content
  const initialContent = fs.readFileSync(logFile, "utf-8");
  const initialLines = initialContent.split("\n").slice(-50);
  for (const line of initialLines) {
    if (line.trim()) {
      console.log(formatLogLine(line));
    }
  }

  // Watch for changes
  const watcher = fs.watch(logFile, async (eventType) => {
    if (eventType === "change") {
      try {
        const currentStats = fs.statSync(logFile);

        if (currentStats.size > lastSize) {
          // Read new content
          const fd = fs.openSync(logFile, "r");
          const buffer = Buffer.alloc(currentStats.size - lastSize);
          fs.readSync(fd, buffer, 0, buffer.length, lastSize);
          fs.closeSync(fd);

          const newContent = buffer.toString("utf-8");
          const newLines = newContent.split("\n");

          for (const line of newLines) {
            if (line.trim()) {
              console.log(formatLogLine(line));
            }
          }

          lastSize = currentStats.size;
        } else if (currentStats.size < lastSize) {
          // File was truncated (e.g., log rotation)
          console.log(colors.dim("--- Log file was truncated ---"));
          lastSize = 0;
        }
      } catch (_error) {
        // File might have been deleted or rotated
      }
    }
  });

  // Handle Ctrl+C
  process.on("SIGINT", () => {
    watcher.close();
    console.log("\n");
    process.exit(0);
  });

  // Keep the process running
  await new Promise(() => {});
}

/**
 * Format a log line with syntax highlighting
 */
function formatLogLine(line: string): string {
  if (!line.trim()) return "";

  // Highlight error-like patterns
  if (line.match(/error|fail|exception/i)) {
    return colors.error(line);
  }

  // Highlight warning-like patterns
  if (line.match(/warn|warning/i)) {
    return colors.warning(line);
  }

  // Highlight info patterns
  if (line.match(/info|loaded|listening|started|ready/i)) {
    return colors.info(line);
  }

  // Default
  return line;
}
