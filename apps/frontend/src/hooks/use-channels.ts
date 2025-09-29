import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/frontend-api";

// Channel types based on backend schemas
export interface Channel {
  id: string;
  userId: string;
  name: string;
  platform: "telegram" | "slack" | "whatsapp" | "email";
  capability: "notification" | "chat" | "bidirectional";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramConfig {
  chat_identifier: string;
  bot_token: string;
}

export interface CreateChannelData {
  name: string;
  platform: Channel["platform"];
  capability: Channel["capability"];
  config: TelegramConfig | Record<string, any>;
}

export interface UpdateChannelData {
  name?: string;
  capability?: Channel["capability"];
  config?: TelegramConfig | Record<string, any>;
  isActive?: boolean;
}

interface ListChannelsResponse {
  channels: Channel[];
  total: number;
}

interface CreateChannelResponse {
  channel: Channel;
  message: string;
}

interface UpdateChannelResponse {
  channel: Channel;
  message: string;
}

interface DeleteChannelResponse {
  success: boolean;
  message: string;
}

/**
 * React Query hook for channels data fetching and management
 */
export function useChannels() {
  const queryClient = useQueryClient();

  const queryKey = ["channels"];

  // Main channels query
  const {
    data: channelsResponse,
    isLoading,
    error,
    refetch,
  } = useQuery<ListChannelsResponse>({
    queryKey,
    queryFn: async () => {
      const response = await apiFetch("/api/channels");

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to load channels");
      }

      return response.json();
    },
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  const channels = channelsResponse?.channels || [];
  const total = channelsResponse?.total || 0;

  // Create channel mutation
  const createChannelMutation = useMutation({
    mutationFn: async (channelData: CreateChannelData) => {
      const response = await apiFetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channelData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error || errorData.message || "Failed to create channel";

        // Provide more user-friendly error messages
        if (response.status === 400) {
          if (errorMessage.includes("bot token")) {
            throw new Error(
              "Invalid bot token. Please check your Telegram bot token and try again.",
            );
          }
          if (errorMessage.includes("chat identifier")) {
            throw new Error(
              "Invalid chat identifier. Please check your channel ID or username.",
            );
          }
          if (errorMessage.includes("Invalid configuration")) {
            throw new Error(
              "Invalid configuration. Please check your Telegram settings and try again.",
            );
          }
        }

        throw new Error(errorMessage);
      }

      return response.json() as Promise<CreateChannelResponse>;
    },
    onSuccess: (data) => {
      // Invalidate and refetch channels
      queryClient.invalidateQueries({ queryKey });
      toast.success(data.message || "Channel created successfully");
    },
    onError: (error) => {
      toast.error(`Create failed: ${error.message}`);
    },
  });

  // Update channel mutation
  const updateChannelMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: UpdateChannelData;
    }) => {
      const response = await apiFetch(`/api/channels/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error || errorData.message || "Failed to update channel";

        // Provide more user-friendly error messages
        if (response.status === 400) {
          if (errorMessage.includes("bot token")) {
            throw new Error(
              "Invalid bot token. Please check your Telegram bot token and try again.",
            );
          }
          if (errorMessage.includes("chat identifier")) {
            throw new Error(
              "Invalid chat identifier. Please check your channel ID or username.",
            );
          }
          if (errorMessage.includes("Invalid configuration")) {
            throw new Error(
              "Invalid configuration. Please check your Telegram settings and try again.",
            );
          }
        }

        if (response.status === 404) {
          throw new Error(
            "Channel not found. It may have been deleted by another user or session.",
          );
        }

        throw new Error(errorMessage);
      }

      return response.json() as Promise<UpdateChannelResponse>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(data.message || "Channel updated successfully");
    },
    onError: (error) => {
      toast.error(`Update failed: ${error.message}`);
    },
  });

  // Delete channel mutation
  const deleteChannelMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiFetch(`/api/channels/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || errorData.message || "Failed to delete channel",
        );
      }

      return response.json() as Promise<DeleteChannelResponse>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(data.message || "Channel deleted successfully");
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });

  // Test connection mutation (sends a test notification)
  const testConnectionMutation = useMutation({
    mutationFn: async (channelId: string) => {
      const response = await apiFetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message:
            "🧪 Test message from Eclaire! If you can see this, your channel is working correctly.",
          severity: "info",
          targetChannels: [channelId],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || errorData.message || "Failed to send test message",
        );
      }

      return response.json();
    },
    onSuccess: (data) => {
      const successCount = data?.successfulChannels || 1;
      const totalCount = data?.totalChannels || 1;

      if (successCount === totalCount) {
        toast.success(
          "🎉 Test message sent successfully! Check your Telegram channel.",
        );
      } else {
        toast.success(
          `Test completed: ${successCount} of ${totalCount} attempts successful.`,
        );
      }
    },
    onError: (error) => {
      toast.error(`Test failed: ${error.message}`);
    },
  });

  // Helper functions
  const createChannel = useCallback(
    (channelData: CreateChannelData) => {
      return createChannelMutation.mutateAsync(channelData);
    },
    [createChannelMutation],
  );

  const updateChannel = useCallback(
    (id: string, updates: UpdateChannelData) => {
      return updateChannelMutation.mutateAsync({ id, updates });
    },
    [updateChannelMutation],
  );

  const deleteChannel = useCallback(
    (id: string) => {
      return deleteChannelMutation.mutateAsync(id);
    },
    [deleteChannelMutation],
  );

  const testConnection = useCallback(
    (channelId: string) => {
      return testConnectionMutation.mutateAsync(channelId);
    },
    [testConnectionMutation],
  );

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    // Data
    channels,
    total,

    // States
    isLoading,
    error,

    // Actions
    createChannel,
    updateChannel,
    deleteChannel,
    testConnection,
    refresh,

    // Mutation states
    isCreating: createChannelMutation.isPending,
    isUpdating: updateChannelMutation.isPending,
    isDeleting: deleteChannelMutation.isPending,
    isTesting: testConnectionMutation.isPending,
  };
}

/**
 * Hook for a single channel by ID
 */
export function useChannel(id: string) {
  const { channels, isLoading, error } = useChannels();

  const channel = channels.find((c) => c.id === id);

  return {
    channel,
    isLoading,
    error,
  };
}
