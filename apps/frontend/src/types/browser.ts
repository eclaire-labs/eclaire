export interface BrowserProfile {
  name: string;
  label: string;
  driver: "existing-session";
  transport: "chrome-mcp";
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
  state: "disabled" | "disconnected" | "connecting" | "connected" | "error";
  profile: BrowserProfile;
  transport: "chrome-mcp";
  capabilities: BrowserCapabilitySet;
  tabCount: number;
  activeTab: BrowserTabSummary | null;
  lastError: string | null;
}
