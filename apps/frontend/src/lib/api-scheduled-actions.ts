/**
 * Scheduled Actions API client.
 */

import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import type {
  ScheduledAction,
  ScheduledActionExecution,
} from "@/types/scheduled-action";

export async function listScheduledActions(params?: {
  status?: string;
  kind?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: ScheduledAction[] }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.kind) searchParams.set("kind", params.kind);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  const qs = searchParams.toString();
  const url = qs ? `/api/scheduled-actions?${qs}` : "/api/scheduled-actions";
  const response = await apiGet(url);
  return response.json();
}

export async function getScheduledAction(id: string): Promise<ScheduledAction> {
  const response = await apiGet(`/api/scheduled-actions/${id}`);
  return response.json();
}

export async function cancelScheduledAction(id: string): Promise<void> {
  await apiPost(`/api/scheduled-actions/${id}/cancel`);
}

export async function deleteScheduledAction(id: string): Promise<void> {
  await apiDelete(`/api/scheduled-actions/${id}`);
}

export async function getScheduledActionExecutions(
  id: string,
): Promise<{ data: ScheduledActionExecution[] }> {
  const response = await apiGet(`/api/scheduled-actions/${id}/executions`);
  return response.json();
}
