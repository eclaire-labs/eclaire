import fs from "node:fs";
import path from "node:path";
import type { McpServerConnection } from "@eclaire/ai";
import { config } from "../../config/index.js";
import { ValidationError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import { getMcpRegistry } from "../mcp/index.js";
import { ChromeMcpSessionManager } from "./chrome-mcp.js";
import { USER_BROWSER_CAPABILITIES, USER_BROWSER_PROFILE } from "./profiles.js";
import type {
  BrowserConversationState,
  BrowserStatus,
  BrowserTabSummary,
} from "./types.js";

const logger = createChildLogger("browser:runtime");

function getConversationKey(context: {
  sessionId?: string;
  conversationId?: string;
  requestId: string;
}): string {
  return context.sessionId ?? context.conversationId ?? context.requestId;
}

export class BrowserRuntime {
  private chromeMcp: ChromeMcpSessionManager | null = null;
  private readonly conversations = new Map<string, BrowserConversationState>();

  private getChromeMcp(): ChromeMcpSessionManager {
    if (this.chromeMcp) return this.chromeMcp;

    let connection: McpServerConnection | undefined;
    try {
      connection = getMcpRegistry().getConnection("chrome-devtools");
    } catch {
      // Registry not initialized yet
    }

    if (!connection) {
      throw new ValidationError(
        "Chrome DevTools MCP server is not configured in the MCP registry.",
      );
    }

    this.chromeMcp = new ChromeMcpSessionManager(connection);
    return this.chromeMcp;
  }

  private getAvailability(): {
    available: boolean;
    reason: string | null;
  } {
    try {
      const registry = getMcpRegistry();
      const availability = registry.getServerAvailability("chrome-devtools");
      return {
        available: availability.availability === "available",
        reason: availability.availabilityReason ?? null,
      };
    } catch {
      return { available: false, reason: "MCP registry not initialized." };
    }
  }

  private getConversationState(key: string): BrowserConversationState {
    const existing = this.conversations.get(key);
    if (existing) {
      existing.updatedAt = Date.now();
      return existing;
    }

    const created: BrowserConversationState = {
      key,
      activeTabId: null,
      lastTabs: [],
      lastSnapshot: null,
      updatedAt: Date.now(),
    };
    this.conversations.set(key, created);
    return created;
  }

  private async refreshTabs(
    state?: BrowserConversationState,
  ): Promise<BrowserTabSummary[]> {
    const tabs = await this.getChromeMcp().listTabs();

    if (state) {
      state.lastTabs = tabs;
      const selectedTab =
        tabs.find((tab) => tab.id === state.activeTabId) ||
        tabs.find((tab) => tab.selected) ||
        tabs[0] ||
        null;
      state.activeTabId = selectedTab?.id ?? null;
      state.updatedAt = Date.now();
    }

    return tabs;
  }

  private getTabById(
    state: BrowserConversationState,
    tabId?: string,
  ): BrowserTabSummary {
    const resolvedId = tabId ?? state.activeTabId;
    if (!resolvedId) {
      throw new Error(
        "No active Chrome tab is selected for this conversation.",
      );
    }

    const tab = state.lastTabs.find((item) => item.id === resolvedId);
    if (!tab) {
      throw new Error("The selected Chrome tab is no longer available.");
    }

    return tab;
  }

  private async selectTabInternal(
    state: BrowserConversationState,
    tabId?: string,
  ): Promise<BrowserTabSummary> {
    const tab = this.getTabById(state, tabId);
    await this.getChromeMcp().selectTab(tab.pageIdx);
    state.activeTabId = tab.id;
    state.updatedAt = Date.now();
    return tab;
  }

  private ensureAvailable(): void {
    const availability = this.getAvailability();
    if (!availability.available) {
      throw new ValidationError(
        availability.reason || "Chrome browser control is unavailable.",
      );
    }
  }

  getToolAvailability(): {
    availability: "available" | "setup_required" | "disabled";
    availabilityReason?: string;
  } {
    try {
      return getMcpRegistry().getServerAvailability("chrome-devtools");
    } catch {
      return {
        availability: "disabled",
        availabilityReason: "MCP registry not initialized.",
      };
    }
  }

  getStatus(conversationKey?: string): BrowserStatus {
    const availability = this.getAvailability();
    const state = conversationKey
      ? this.conversations.get(conversationKey)
      : undefined;
    const activeTab =
      state?.lastTabs.find((tab) => tab.id === state.activeTabId) ||
      state?.lastTabs.find((tab) => tab.selected) ||
      null;

    let mcpState: string = "disabled";
    let mcpLastError: string | null = null;

    if (availability.available) {
      try {
        const chromeMcp = this.getChromeMcp();
        mcpState = chromeMcp.getState();
        mcpLastError = chromeMcp.getLastError();
      } catch {
        mcpState = "error";
      }
    }

    return {
      enabled: availability.available,
      available: availability.available,
      state: mcpState as BrowserStatus["state"],
      profile: USER_BROWSER_PROFILE,
      transport: USER_BROWSER_PROFILE.transport,
      capabilities: USER_BROWSER_CAPABILITIES,
      tabCount: state?.lastTabs.length ?? 0,
      activeTab,
      lastError: availability.reason || mcpLastError,
    };
  }

  async attach(conversationKey?: string): Promise<BrowserStatus> {
    this.ensureAvailable();
    await this.getChromeMcp().ensureConnected();

    if (conversationKey) {
      const state = this.getConversationState(conversationKey);
      await this.refreshTabs(state);
    }

    return this.getStatus(conversationKey);
  }

  async detach(conversationKey?: string): Promise<BrowserStatus> {
    await this.getChromeMcp().disconnect();

    if (conversationKey) {
      const state = this.getConversationState(conversationKey);
      state.lastTabs = [];
      state.activeTabId = null;
      state.lastSnapshot = null;
      state.updatedAt = Date.now();
    }

    return this.getStatus(conversationKey);
  }

  async listTabs(context: {
    sessionId?: string;
    conversationId?: string;
    requestId: string;
  }): Promise<BrowserTabSummary[]> {
    this.ensureAvailable();
    const state = this.getConversationState(getConversationKey(context));
    await this.getChromeMcp().ensureConnected();
    return this.refreshTabs(state);
  }

  async selectTab(
    tabId: string,
    context: {
      sessionId?: string;
      conversationId?: string;
      requestId: string;
    },
  ): Promise<BrowserTabSummary> {
    this.ensureAvailable();
    const state = this.getConversationState(getConversationKey(context));
    await this.getChromeMcp().ensureConnected();
    if (state.lastTabs.length === 0) {
      await this.refreshTabs(state);
    }
    const tab = await this.selectTabInternal(state, tabId);
    await this.refreshTabs(state);
    return tab;
  }

  async open(
    url: string,
    context: {
      sessionId?: string;
      conversationId?: string;
      requestId: string;
    },
  ): Promise<{ tab: BrowserTabSummary | null; message: string }> {
    this.ensureAvailable();
    const state = this.getConversationState(getConversationKey(context));
    await this.getChromeMcp().ensureConnected();
    const message = await this.getChromeMcp().openTab(url);
    const tabs = await this.refreshTabs(state);
    const activeTab =
      tabs.find((tab) => tab.selected) || tabs[tabs.length - 1] || null;
    state.activeTabId = activeTab?.id ?? null;
    return { tab: activeTab, message };
  }

  async navigate(
    url: string,
    context: {
      sessionId?: string;
      conversationId?: string;
      requestId: string;
    },
    tabId?: string,
  ): Promise<{ tab: BrowserTabSummary; message: string }> {
    this.ensureAvailable();
    const state = this.getConversationState(getConversationKey(context));
    await this.getChromeMcp().ensureConnected();
    if (state.lastTabs.length === 0) {
      await this.refreshTabs(state);
    }
    const tab = await this.selectTabInternal(state, tabId);
    const message = await this.getChromeMcp().navigate(url);
    await this.refreshTabs(state);
    return { tab, message };
  }

  async snapshot(
    context: {
      sessionId?: string;
      conversationId?: string;
      requestId: string;
    },
    tabId?: string,
  ): Promise<{ tab: BrowserTabSummary; snapshot: string }> {
    this.ensureAvailable();
    const state = this.getConversationState(getConversationKey(context));
    await this.getChromeMcp().ensureConnected();
    if (state.lastTabs.length === 0) {
      await this.refreshTabs(state);
    }
    const tab = await this.selectTabInternal(state, tabId);
    const snapshot = await this.getChromeMcp().snapshot();
    state.lastSnapshot = snapshot;
    return { tab, snapshot };
  }

  async click(
    uid: string,
    context: {
      sessionId?: string;
      conversationId?: string;
      requestId: string;
    },
    tabId?: string,
  ): Promise<{ tab: BrowserTabSummary; message: string }> {
    this.ensureAvailable();
    const state = this.getConversationState(getConversationKey(context));
    await this.getChromeMcp().ensureConnected();
    if (state.lastTabs.length === 0) {
      await this.refreshTabs(state);
    }
    const tab = await this.selectTabInternal(state, tabId);
    const message = await this.getChromeMcp().click(uid);
    return { tab, message };
  }

  async fill(
    uid: string,
    value: string,
    context: {
      sessionId?: string;
      conversationId?: string;
      requestId: string;
    },
    tabId?: string,
  ): Promise<{ tab: BrowserTabSummary; message: string }> {
    this.ensureAvailable();
    const state = this.getConversationState(getConversationKey(context));
    await this.getChromeMcp().ensureConnected();
    if (state.lastTabs.length === 0) {
      await this.refreshTabs(state);
    }
    const tab = await this.selectTabInternal(state, tabId);
    const message = await this.getChromeMcp().fill(uid, value);
    return { tab, message };
  }

  async pressKey(
    key: string,
    context: {
      sessionId?: string;
      conversationId?: string;
      requestId: string;
    },
    tabId?: string,
  ): Promise<{ tab: BrowserTabSummary; message: string }> {
    this.ensureAvailable();
    const state = this.getConversationState(getConversationKey(context));
    await this.getChromeMcp().ensureConnected();
    if (state.lastTabs.length === 0) {
      await this.refreshTabs(state);
    }
    const tab = await this.selectTabInternal(state, tabId);
    const message = await this.getChromeMcp().pressKey(key);
    return { tab, message };
  }

  async screenshot(
    context: {
      sessionId?: string;
      conversationId?: string;
      requestId: string;
    },
    tabId?: string,
  ): Promise<{
    tab: BrowserTabSummary;
    screenshotPath: string;
    message: string;
  }> {
    this.ensureAvailable();
    const state = this.getConversationState(getConversationKey(context));
    await this.getChromeMcp().ensureConnected();
    if (state.lastTabs.length === 0) {
      await this.refreshTabs(state);
    }
    const tab = await this.selectTabInternal(state, tabId);
    const screenshotDir = path.resolve(
      config.dirs.browserData,
      "chrome-mcp",
      "screenshots",
      state.key,
    );
    fs.mkdirSync(screenshotDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const screenshotPath = path.join(screenshotDir, `chrome-${timestamp}.png`);
    const message = await this.getChromeMcp().screenshot(screenshotPath);
    return { tab, screenshotPath, message };
  }

  async closeTab(
    context: {
      sessionId?: string;
      conversationId?: string;
      requestId: string;
    },
    tabId?: string,
  ): Promise<{
    closedTab: BrowserTabSummary;
    nextTab: BrowserTabSummary | null;
    message: string;
  }> {
    this.ensureAvailable();
    const state = this.getConversationState(getConversationKey(context));
    await this.getChromeMcp().ensureConnected();
    if (state.lastTabs.length === 0) {
      await this.refreshTabs(state);
    }
    const tab = await this.selectTabInternal(state, tabId);
    const message = await this.getChromeMcp().closeTab(tab.pageIdx);
    const tabs = await this.refreshTabs(state);
    const nextTab = tabs.find((item) => item.selected) || tabs[0] || null;
    state.activeTabId = nextTab?.id ?? null;
    return { closedTab: tab, nextTab, message };
  }

  clearConversationState(context: {
    sessionId?: string;
    conversationId?: string;
    requestId: string;
  }): void {
    this.conversations.delete(getConversationKey(context));
    logger.debug(
      { conversationKey: getConversationKey(context) },
      "Cleared browser conversation state",
    );
  }
}

export const browserRuntime = new BrowserRuntime();
