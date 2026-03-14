import type { BrowserCapabilitySet, BrowserProfile } from "./types.js";

export const USER_BROWSER_PROFILE: BrowserProfile = {
  name: "user",
  label: "My Chrome Session",
  driver: "existing-session",
  transport: "chrome-mcp",
  attachOnly: true,
};

export const USER_BROWSER_CAPABILITIES: BrowserCapabilitySet = {
  interactive: true,
  authenticatedSession: true,
  localOnly: true,
  screenshot: true,
  tabSelection: true,
};
