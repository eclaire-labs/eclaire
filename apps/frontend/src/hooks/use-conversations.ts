import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { listSessions } from "@/lib/api-sessions";
import { useSSEConnectionStatus } from "@/providers/ProcessingEventsProvider";
import type { ConversationSummary } from "@/types/conversation";

export interface ConversationGroup {
  label: string;
  conversations: ConversationSummary[];
}

function groupByTime(
  conversations: ConversationSummary[],
): ConversationGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const today: ConversationSummary[] = [];
  const yesterday: ConversationSummary[] = [];
  const thisWeek: ConversationSummary[] = [];
  const older: ConversationSummary[] = [];

  for (const conv of conversations) {
    const date = new Date(conv.lastMessageAt ?? conv.createdAt);
    if (date >= todayStart) {
      today.push(conv);
    } else if (date >= yesterdayStart) {
      yesterday.push(conv);
    } else if (date >= weekStart) {
      thisWeek.push(conv);
    } else {
      older.push(conv);
    }
  }

  const groups: ConversationGroup[] = [];
  if (today.length > 0) groups.push({ label: "Today", conversations: today });
  if (yesterday.length > 0)
    groups.push({ label: "Yesterday", conversations: yesterday });
  if (thisWeek.length > 0)
    groups.push({ label: "This Week", conversations: thisWeek });
  if (older.length > 0) groups.push({ label: "Older", conversations: older });

  return groups;
}

export function useConversations() {
  const { isConnected } = useSSEConnectionStatus();

  const query = useQuery({
    queryKey: ["sidebar-conversations"],
    queryFn: () => listSessions(30, 0),
    refetchInterval: isConnected ? false : 30_000,
    staleTime: 10_000,
  });

  const groups = useMemo(
    () => groupByTime(query.data?.items ?? []),
    [query.data],
  );

  return {
    groups,
    conversations: query.data?.items ?? [],
    isLoading: query.isLoading,
  };
}
