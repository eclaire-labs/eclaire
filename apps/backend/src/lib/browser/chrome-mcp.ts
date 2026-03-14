/**
 * Chrome MCP Session Manager
 *
 * Chrome-specific wrapper around the generic McpServerConnection.
 * Provides typed methods for Chrome DevTools operations and handles
 * Chrome-specific response parsing (tab lists, text content, etc.).
 */

import type { McpServerConnection } from "@eclaire/ai";
import type { BrowserState, BrowserTabSummary } from "./types.js";

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
  constructor(private readonly connection: McpServerConnection) {}

  getState(): BrowserState {
    return this.connection.getState() as BrowserState;
  }

  getLastError(): string | null {
    return this.connection.getLastError();
  }

  async ensureConnected(): Promise<void> {
    return this.connection.ensureConnected();
  }

  async disconnect(): Promise<void> {
    return this.connection.disconnect();
  }

  async listTabs(): Promise<BrowserTabSummary[]> {
    const result = await this.connection.callTool("list_pages");
    return extractPages(result);
  }

  async openTab(url: string): Promise<string> {
    const result = await this.connection.callTool("new_page", { url });
    return normalizeTextContent(result) || "Opened a new Chrome tab.";
  }

  async selectTab(pageIdx: number): Promise<string> {
    const result = await this.connection.callTool("select_page", {
      pageId: pageIdx,
    });
    return normalizeTextContent(result) || `Selected tab ${pageIdx}.`;
  }

  async closeTab(pageIdx: number): Promise<string> {
    const result = await this.connection.callTool("close_page", {
      pageId: pageIdx,
    });
    return normalizeTextContent(result) || `Closed tab ${pageIdx}.`;
  }

  async navigate(url: string): Promise<string> {
    const result = await this.connection.callTool("navigate_page", { url });
    return normalizeTextContent(result) || `Navigated to ${url}.`;
  }

  async snapshot(): Promise<string> {
    const result = await this.connection.callTool("take_snapshot");
    return normalizeTextContent(result) || "Snapshot captured.";
  }

  async click(uid: string): Promise<string> {
    const result = await this.connection.callTool("click", { uid });
    return normalizeTextContent(result) || `Clicked ${uid}.`;
  }

  async fill(uid: string, value: string): Promise<string> {
    const result = await this.connection.callTool("fill", { uid, value });
    return normalizeTextContent(result) || `Filled ${uid}.`;
  }

  async pressKey(key: string): Promise<string> {
    const result = await this.connection.callTool("press_key", { key });
    return normalizeTextContent(result) || `Pressed ${key}.`;
  }

  async screenshot(filePath: string): Promise<string> {
    const result = await this.connection.callTool("take_screenshot", {
      filePath,
    });
    return normalizeTextContent(result) || `Screenshot saved to ${filePath}.`;
  }
}
