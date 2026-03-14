import { mkdirSync } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Mutex } from "async-mutex";
import { config } from "../../config/index.js";
import { createChildLogger } from "../logger.js";
import { resolveBrowserCommand } from "./command.js";
import type { BrowserState, BrowserTabSummary } from "./types.js";

const logger = createChildLogger("browser:chrome-mcp");

function sanitizeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function normalizeTextContent(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "";
  }

  const maybeResult = result as {
    structuredContent?: unknown;
    content?: Array<{ type?: string; text?: string }>;
  };

  const text = maybeResult.content
    ?.filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();

  if (text) {
    return text;
  }

  if (maybeResult.structuredContent !== undefined) {
    try {
      return JSON.stringify(maybeResult.structuredContent, null, 2);
    } catch {
      return String(maybeResult.structuredContent);
    }
  }

  return "";
}

function parsePagesFromStructured(value: unknown): BrowserTabSummary[] {
  const items = Array.isArray(value)
    ? value
    : value &&
        typeof value === "object" &&
        "pages" in value &&
        Array.isArray((value as { pages?: unknown[] }).pages)
      ? (value as { pages: unknown[] }).pages
      : null;

  if (!items) {
    return [];
  }

  return items
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const page = item as {
        id?: number | string;
        pageId?: number | string;
        pageIdx?: number;
        title?: string;
        url?: string;
        selected?: boolean;
        targetId?: string;
      };
      const rawPageId =
        typeof page.pageId === "number"
          ? page.pageId
          : typeof page.pageId === "string"
            ? Number.parseInt(page.pageId, 10)
            : typeof page.pageIdx === "number"
              ? page.pageIdx
              : typeof page.id === "number"
                ? page.id
                : typeof page.id === "string"
                  ? Number.parseInt(page.id, 10)
                  : Number.NaN;

      if (!Number.isFinite(rawPageId)) {
        return null;
      }

      const pageIdx = rawPageId;

      return {
        id:
          typeof page.targetId === "string" && page.targetId.length > 0
            ? page.targetId
            : typeof page.id === "string" && page.id.length > 0
              ? page.id
              : String(pageIdx),
        pageIdx,
        title: page.title || page.url || `Page ${pageIdx}`,
        url: page.url || "",
        selected: page.selected === true,
      } satisfies BrowserTabSummary;
    })
    .filter((item): item is BrowserTabSummary => item !== null);
}

function parsePagesFromText(text: string): BrowserTabSummary[] {
  const pages: BrowserTabSummary[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const legacyMatch = line.match(
      /^-?\s*(\d+):\s*(.+?)\s+\((.+?)\)(?:\s+\[selected\])?$/,
    );

    if (legacyMatch) {
      const pageIdx = Number.parseInt(legacyMatch[1] || "", 10);
      const title = legacyMatch[2]?.trim() || `Page ${pageIdx}`;
      const url = legacyMatch[3]?.trim() || "";
      const selected = line.includes("[selected]");

      if (!Number.isFinite(pageIdx)) {
        continue;
      }

      pages.push({
        id: String(pageIdx),
        pageIdx,
        title,
        url,
        selected,
      });
      continue;
    }

    const match = line.match(
      /^-?\s*(\d+):\s*(\S+?)(?:\s+\[selected\])?(?:\s+isolatedContext=.*)?$/,
    );

    if (!match) {
      continue;
    }

    const pageIdx = Number.parseInt(match[1] || "", 10);
    const url = match[2]?.trim() || "";
    const selected = line.includes("[selected]");

    if (!Number.isFinite(pageIdx)) {
      continue;
    }

    pages.push({
      id: String(pageIdx),
      pageIdx,
      title: url || `Page ${pageIdx}`,
      url,
      selected,
    });
  }

  return pages;
}

function extractPages(result: unknown): BrowserTabSummary[] {
  if (!result || typeof result !== "object") {
    return [];
  }

  const structured = (result as { structuredContent?: unknown })
    .structuredContent;
  const structuredPages = parsePagesFromStructured(structured);
  if (structuredPages.length > 0) {
    return structuredPages;
  }

  return parsePagesFromText(normalizeTextContent(result));
}

export class ChromeMcpSessionManager {
  private client: Client | null = null;
  private state: BrowserState = "disconnected";
  private lastError: string | null = null;
  private readonly mutex = new Mutex();

  getState(): BrowserState {
    return this.state;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  private createTransport(): StdioClientTransport {
    const command =
      resolveBrowserCommand(config.browser.chromeMcpCommand) ||
      config.browser.chromeMcpCommand;

    return new StdioClientTransport({
      command,
      args: ["--autoConnect"],
      stderr: "pipe",
      cwd: config.home,
      env: sanitizeEnv(process.env),
    });
  }

  async ensureConnected(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (this.client && this.state === "connected") {
        return;
      }

      this.state = "connecting";
      this.lastError = null;

      const transport = this.createTransport();
      const client = new Client(
        {
          name: "@eclaire/backend",
          version: "0.0.0",
        },
        {
          capabilities: {},
        },
      );

      try {
        const rootDir = path.join(config.dirs.browserData, "chrome-mcp");
        mkdirSync(rootDir, { recursive: true });

        await Promise.race([
          client.connect(transport),
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(
                new Error(
                  `Chrome MCP connect timed out after ${config.browser.chromeMcpConnectTimeout}ms`,
                ),
              );
            }, config.browser.chromeMcpConnectTimeout);
          }),
        ]);

        this.client = client;
        this.state = "connected";
        logger.info("Chrome MCP attached");
      } catch (error) {
        this.client = null;
        this.state = "error";
        this.lastError =
          error instanceof Error
            ? error.message
            : "Failed to attach to Chrome MCP";
        logger.warn({ err: error }, "Chrome MCP attach failed");
        throw error;
      }
    });
  }

  async disconnect(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      try {
        await this.client?.close();
      } catch (error) {
        logger.warn(
          { err: error },
          "Failed to close Chrome MCP client cleanly",
        );
      } finally {
        this.client = null;
        this.state = "disconnected";
      }
    });
  }

  private async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    await this.ensureConnected();

    if (!this.client) {
      throw new Error("Chrome MCP client is not connected");
    }

    try {
      return await this.client.callTool({
        name,
        arguments: args,
      });
    } catch (error) {
      this.state = "error";
      this.lastError =
        error instanceof Error
          ? error.message
          : `Chrome MCP tool '${name}' failed`;
      throw error;
    }
  }

  async listTabs(): Promise<BrowserTabSummary[]> {
    const result = await this.callTool("list_pages");
    return extractPages(result);
  }

  async openTab(url: string): Promise<string> {
    const result = await this.callTool("new_page", { url });
    return normalizeTextContent(result) || "Opened a new Chrome tab.";
  }

  async selectTab(pageIdx: number): Promise<string> {
    const result = await this.callTool("select_page", { pageId: pageIdx });
    return normalizeTextContent(result) || `Selected tab ${pageIdx}.`;
  }

  async closeTab(pageIdx: number): Promise<string> {
    const result = await this.callTool("close_page", { pageId: pageIdx });
    return normalizeTextContent(result) || `Closed tab ${pageIdx}.`;
  }

  async navigate(url: string): Promise<string> {
    const result = await this.callTool("navigate_page", { url });
    return normalizeTextContent(result) || `Navigated to ${url}.`;
  }

  async snapshot(): Promise<string> {
    const result = await this.callTool("take_snapshot");
    return normalizeTextContent(result) || "Snapshot captured.";
  }

  async click(uid: string): Promise<string> {
    const result = await this.callTool("click", { uid });
    return normalizeTextContent(result) || `Clicked ${uid}.`;
  }

  async fill(uid: string, value: string): Promise<string> {
    const result = await this.callTool("fill", { uid, value });
    return normalizeTextContent(result) || `Filled ${uid}.`;
  }

  async pressKey(key: string): Promise<string> {
    const result = await this.callTool("press_key", { key });
    return normalizeTextContent(result) || `Pressed ${key}.`;
  }

  async screenshot(filePath: string): Promise<string> {
    const result = await this.callTool("take_screenshot", { filePath });
    return normalizeTextContent(result) || `Screenshot saved to ${filePath}.`;
  }
}
