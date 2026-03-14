import { apiGet, apiPost } from "@/lib/api-client";
import type { BrowserStatus, BrowserTabSummary } from "@/types/browser";

export async function getBrowserStatus(): Promise<BrowserStatus> {
  const response = await apiGet("/api/browser/status");
  return response.json();
}

export async function attachBrowser(): Promise<BrowserStatus> {
  const response = await apiPost("/api/browser/attach");
  return response.json();
}

export async function detachBrowser(): Promise<BrowserStatus> {
  const response = await apiPost("/api/browser/detach");
  return response.json();
}

export async function listBrowserTabs(): Promise<{
  items: BrowserTabSummary[];
}> {
  const response = await apiGet("/api/browser/tabs");
  return response.json();
}
