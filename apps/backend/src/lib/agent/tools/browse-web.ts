import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { config } from "../../../config/index.js";
import { createChildLogger } from "../../logger.js";
import { CliExecutionError, runAllowedCliCommand } from "./cli-runner.js";

const logger = createChildLogger("agent-tools:browse-web");

const inputSchema = z.object({
  action: z
    .enum(["open", "snapshot", "wait", "get", "screenshot", "close"])
    .describe("The browser action to perform."),
  url: z
    .string()
    .optional()
    .describe("Public http/https URL to open. Required for the 'open' action."),
  interactive: z
    .boolean()
    .optional()
    .describe(
      "When true, return only interactive elements with @refs (snapshot action).",
    ),
  compact: z
    .boolean()
    .optional()
    .describe("When true, remove empty structural elements (snapshot action)."),
  selector: z
    .string()
    .optional()
    .describe("CSS selector to scope the snapshot or get action."),
  waitType: z
    .enum(["load", "text", "url", "milliseconds"])
    .optional()
    .describe(
      "Type of browser condition to wait for. Required for the 'wait' action.",
    ),
  value: z
    .union([z.string(), z.number()])
    .optional()
    .describe("Value for the wait type. Required for the 'wait' action."),
  target: z
    .enum(["title", "url", "text", "html"])
    .optional()
    .describe(
      "Type of page information to read. Required for the 'get' action.",
    ),
  fullPage: z
    .boolean()
    .optional()
    .describe(
      "Capture the full page instead of only the viewport (screenshot action).",
    ),
});

type BrowseWebInput = z.infer<typeof inputSchema>;

export interface BrowseWebInvocation {
  args: string[];
  screenshotPath?: string;
  sessionName: string;
}

function sanitizeSessionName(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-");
  return cleaned.replace(/^-|-$/g, "").slice(0, 48) || "default";
}

export function getBrowseWebSessionName(ctx: {
  sessionId?: string;
  conversationId?: string;
  requestId: string;
}): string {
  const source = ctx.sessionId ?? ctx.conversationId ?? ctx.requestId;
  return `eclaire-${sanitizeSessionName(source)}`;
}

function isDeniedIpAddress(hostname: string): boolean {
  const ipVersion = net.isIP(hostname);

  if (ipVersion === 4) {
    const [a = 0, b = 0] = hostname
      .split(".")
      .map((part) => Number.parseInt(part, 10));
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  }

  if (ipVersion === 6) {
    const normalized = hostname.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return false;
}

export function validateBrowseWebUrl(rawUrl: string): URL {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error("browseWeb only accepts valid URLs.");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("browseWeb only allows http and https URLs.");
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("browseWeb does not allow credentialed URLs.");
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const deniedHostnames = [
    "localhost",
    "0.0.0.0",
    "host.docker.internal",
    "gateway.docker.internal",
  ];

  if (
    deniedHostnames.includes(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home.arpa") ||
    hostname.endsWith(".lan") ||
    isDeniedIpAddress(hostname)
  ) {
    throw new Error("browseWeb blocks local and private-network URLs.");
  }

  return parsedUrl;
}

function buildToolPaths(sessionName: string): {
  profileDir: string;
  screenshotDir: string;
} {
  const rootDir = path.join(config.dirs.browserData, "agent-browser");
  return {
    profileDir: path.join(rootDir, "profiles", sessionName),
    screenshotDir: path.join(rootDir, "screenshots", sessionName),
  };
}

function createScreenshotPath(screenshotDir: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(screenshotDir, `browse-${timestamp}.png`);
}

function getBaseArgs(
  sessionName: string,
  profileDir: string,
  screenshotDir: string,
): string[] {
  return [
    "--session",
    sessionName,
    "--profile",
    profileDir,
    "--screenshot-dir",
    screenshotDir,
    "--max-output",
    "12000",
  ];
}

export function buildBrowseWebInvocation(
  input: BrowseWebInput,
  context: {
    sessionId?: string;
    conversationId?: string;
    requestId: string;
  },
): BrowseWebInvocation {
  const sessionName = getBrowseWebSessionName(context);
  const { profileDir, screenshotDir } = buildToolPaths(sessionName);
  const args = getBaseArgs(sessionName, profileDir, screenshotDir);

  switch (input.action) {
    case "open": {
      if (!input.url) {
        throw new Error("browseWeb open requires a url.");
      }
      const url = validateBrowseWebUrl(input.url);
      return {
        args: [...args, "open", url.toString()],
        sessionName,
      };
    }

    case "snapshot": {
      const snapshotArgs = [...args, "snapshot"];
      if (input.interactive ?? true) {
        snapshotArgs.push("-i");
      }
      if (input.compact) {
        snapshotArgs.push("-c");
      }
      if (input.selector) {
        snapshotArgs.push("-s", input.selector);
      }
      return { args: snapshotArgs, sessionName };
    }

    case "wait": {
      if (!input.waitType || input.value == null) {
        throw new Error("browseWeb wait requires waitType and value.");
      }
      const waitArgs = [...args, "wait"];
      if (input.waitType === "load") {
        waitArgs.push("--load", String(input.value));
      } else if (input.waitType === "text") {
        waitArgs.push("--text", String(input.value));
      } else if (input.waitType === "url") {
        waitArgs.push("--url", String(input.value));
      } else {
        waitArgs.push(String(input.value));
      }
      return { args: waitArgs, sessionName };
    }

    case "get": {
      if (!input.target) {
        throw new Error("browseWeb get requires a target.");
      }
      const getArgs = [...args, "get", input.target];
      if (input.target === "text" || input.target === "html") {
        if (!input.selector) {
          throw new Error(`browseWeb get:${input.target} requires a selector.`);
        }
        getArgs.push(input.selector);
      } else if (input.selector) {
        getArgs.push(input.selector);
      }
      return { args: getArgs, sessionName };
    }

    case "screenshot": {
      const screenshotPath = createScreenshotPath(screenshotDir);
      const screenshotArgs = [...args, "screenshot", screenshotPath];
      if (input.fullPage) {
        screenshotArgs.push("--full");
      }
      return { args: screenshotArgs, screenshotPath, sessionName };
    }

    case "close":
      return { args: [...args, "close"], sessionName };
  }
}

function formatCliFailure(error: CliExecutionError): string {
  const parts = [error.message];
  if (error.stderr) {
    parts.push(`stderr:\n${error.stderr}`);
  }
  if (error.stdout) {
    parts.push(`stdout:\n${error.stdout}`);
  }
  return parts.join("\n\n");
}

export const browseWebTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "browseWeb",
  label: "Browse Web",
  description:
    "Browse public websites in a read-only way: open pages, inspect accessible snapshots, wait for content, read page details, take screenshots, and close the browser session.",
  inputSchema,
  promptSnippet: [
    "When you need current public-web information, use browseWeb in short steps.",
    "Typical flow: open the page, snapshot it, inspect the result, then use get/wait/screenshot as needed.",
    "For complex browser workflows or command examples, load the `agent-browser` skill before proceeding.",
  ].join(" "),
  promptGuidelines: [
    "Use browseWeb only for public web research in this tool version.",
    "Do not attempt clicks, form fills, logins, downloads, or other write actions with browseWeb.",
    "Re-run snapshot after navigation or page changes so element references stay current.",
  ],
  execute: async (_callId, input, ctx) => {
    try {
      const invocation = buildBrowseWebInvocation(input, {
        sessionId: ctx.sessionId,
        conversationId:
          typeof ctx.extra?.conversationId === "string"
            ? ctx.extra.conversationId
            : undefined,
        requestId: ctx.requestId,
      });
      const { profileDir, screenshotDir } = buildToolPaths(
        invocation.sessionName,
      );
      fs.mkdirSync(profileDir, { recursive: true });
      fs.mkdirSync(screenshotDir, { recursive: true });

      const result = await runAllowedCliCommand({
        binary: "agent-browser",
        args: invocation.args,
        timeoutMs: config.timeouts.pageNavigation,
      });

      if (input.action === "screenshot" && invocation.screenshotPath) {
        return textResult(
          `Screenshot saved to ${invocation.screenshotPath}${result.stdout ? `\n${result.stdout}` : ""}`,
          {
            sessionName: invocation.sessionName,
            screenshotPath: invocation.screenshotPath,
            command: ["agent-browser", ...invocation.args].join(" "),
          },
        );
      }

      const fallbackMessages: Record<BrowseWebInput["action"], string> = {
        open: "Page opened.",
        snapshot: "Snapshot captured.",
        wait: "Wait completed.",
        get: "Page details retrieved.",
        close: "Browser session closed.",
        screenshot: "Screenshot captured.",
      };

      return textResult(result.stdout || fallbackMessages[input.action], {
        sessionName: invocation.sessionName,
        command: ["agent-browser", ...invocation.args].join(" "),
      });
    } catch (error) {
      if (error instanceof CliExecutionError) {
        logger.warn(
          { err: error, binary: error.binary, args: error.args },
          "browseWeb command failed",
        );
        return errorResult(formatCliFailure(error));
      }

      return errorResult(
        error instanceof Error ? error.message : "browseWeb failed",
      );
    }
  },
};
