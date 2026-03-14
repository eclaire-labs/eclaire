export type BrowserProfileDriver = "existing-session";

export type BrowserTransport = "chrome-mcp";

export type BrowserState =
  | "disabled"
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface BrowserProfile {
  name: string;
  label: string;
  driver: BrowserProfileDriver;
  transport: BrowserTransport;
  attachOnly: boolean;
}

export interface BrowserCapabilitySet {
  interactive: boolean;
  authenticatedSession: boolean;
  localOnly: boolean;
  screenshot: boolean;
  tabSelection: boolean;
}

export interface BrowserTabSummary {
  id: string;
  pageIdx: number;
  title: string;
  url: string;
  selected: boolean;
}

export interface BrowserStatus {
  enabled: boolean;
  available: boolean;
  state: BrowserState;
  profile: BrowserProfile;
  transport: BrowserTransport;
  capabilities: BrowserCapabilitySet;
  tabCount: number;
  activeTab: BrowserTabSummary | null;
  lastError: string | null;
}

export interface BrowserConversationState {
  key: string;
  activeTabId: string | null;
  lastTabs: BrowserTabSummary[];
  lastSnapshot: string | null;
  updatedAt: number;
}
