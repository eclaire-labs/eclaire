
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSession } from "@/lib/auth";
import { getAbsoluteApiUrl } from "@/lib/frontend-api";

export type AssetType =
  | "photos"
  | "documents"
  | "bookmarks"
  | "notes"
  | "tasks";
export type ProcessingStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retry_pending"
  | "unknown";

/**
 * SSE event structure for real-time processing updates
 *
 * Event types follow a symmetric `{scope}_{action}` pattern:
 * - job_*: Job-level events
 * - stage_*: Stage-level events
 */
export interface ProcessingEvent {
  type:
    | "connected" // System: SSE connection established
    | "ping" // System: Keep-alive ping
    | "job_queued" // Job created, waiting in queue
    | "stage_started" // Stage began processing
    | "stage_progress" // Progress update within stage (0-100)
    | "stage_completed" // Stage finished successfully
    | "stage_failed" // Stage failed
    | "job_completed" // All stages done, job succeeded
    | "job_failed"; // Job in terminal failure state

  // Asset identity (for processing events)
  assetType?: AssetType;
  assetId?: string;

  // Stage name (for stage_* events)
  stage?: string;

  // Progress 0-100 (for stage_progress)
  progress?: number;

  // Error message (for *_failed events)
  error?: string;

  timestamp: number;
  userId?: string;
}

interface ProcessingEventsContextType {
  events: ProcessingEvent[];
  isConnected: boolean;
  clearEvents: () => void;
  registerRefreshCallback: (
    assetType: AssetType,
    callback: () => void,
  ) => () => void;
}

const ProcessingEventsContext =
  createContext<ProcessingEventsContextType | null>(null);

interface ProcessingEventsProviderProps {
  children: ReactNode;
}

export function ProcessingEventsProvider({
  children,
}: ProcessingEventsProviderProps) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState<ProcessingEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const refreshCallbacksRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    // Only connect if user is authenticated
    if (!session?.user) {
      return;
    }
    let reconnectTimeoutId: NodeJS.Timeout;

    const connectSSE = () => {
      if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        console.warn(
          "Max SSE reconnection attempts reached. Stopping reconnection.",
        );
        return;
      }

      try {
        const sseUrl = getAbsoluteApiUrl("/api/processing-events/stream");
        const eventSource = new EventSource(sseUrl, {
          withCredentials: true,
        });

        eventSource.onopen = () => {
          setIsConnected(true);
          reconnectAttemptsRef.current = 0; // Reset counter on successful connection
          console.log("Global processing events connected");
        };

        eventSource.onmessage = (event) => {
          try {
            const data: ProcessingEvent = JSON.parse(event.data);

            // Add to events list (keep last 50 events)
            setEvents((prev) => [...prev.slice(-49), data]);

            // Handle different event types
            const { type, assetType, assetId, progress } = data;

            // Skip system events (connected, ping)
            if (type === "connected" || type === "ping") {
              return;
            }

            // All processing events should have assetType and assetId
            if (!assetType || !assetId) {
              console.warn("Processing event missing assetType or assetId:", data);
              return;
            }

            switch (type) {
              case "job_queued":
                // Invalidate processing status and asset query (for detail page)
                queryClient.invalidateQueries({
                  queryKey: ["processing-status", assetType, assetId],
                });
                queryClient.invalidateQueries({
                  queryKey: [assetType, assetId],
                });
                break;

              case "stage_started":
                // Invalidate to refetch fresh status
                queryClient.invalidateQueries({
                  queryKey: ["processing-status", assetType, assetId],
                });
                // Optimistically update the asset's processingStatus in the list
                // This ensures the UI shows "processing" immediately without a list refetch
                queryClient.setQueriesData<any[]>(
                  { queryKey: [assetType] },
                  (oldData) => {
                    if (!oldData || !Array.isArray(oldData)) return oldData;
                    return oldData.map((item: any) =>
                      item.id === assetId
                        ? { ...item, processingStatus: "processing" }
                        : item
                    );
                  }
                );
                // Optimistically update the asset's processingStatus in the detail view
                queryClient.setQueriesData<any>(
                  { queryKey: [assetType, assetId] },
                  (oldData: any) => {
                    if (!oldData) return oldData;
                    return { ...oldData, processingStatus: "processing" };
                  }
                );
                break;

              case "stage_completed":
                // Invalidate to refetch fresh status
                queryClient.invalidateQueries({
                  queryKey: ["processing-status", assetType, assetId],
                });
                break;

              case "stage_progress":
                // Optimistic progress update (frequent, no refetch needed)
                if (typeof progress === "number") {
                  queryClient.setQueryData(
                    ["processing-status", assetType, assetId],
                    (old: any) =>
                      old ? { ...old, overallProgress: progress } : old,
                  );
                }
                break;

              case "job_completed":
                // Invalidate processing status
                queryClient.invalidateQueries({
                  queryKey: ["processing-status", assetType, assetId],
                });
                // Invalidate asset list and individual asset to get fresh data
                queryClient.invalidateQueries({
                  queryKey: [assetType],
                });
                queryClient.invalidateQueries({
                  queryKey: [assetType, assetId],
                });
                // For photos, also invalidate AI analysis cache
                if (assetType === "photos") {
                  queryClient.invalidateQueries({
                    queryKey: ["photo-analysis", assetId],
                  });
                }
                // Trigger registered refresh callbacks
                const callback = refreshCallbacksRef.current.get(assetType);
                if (callback) {
                  callback();
                }
                break;

              case "stage_failed":
              case "job_failed":
                // Invalidate to show error state
                queryClient.invalidateQueries({
                  queryKey: ["processing-status", assetType, assetId],
                });
                // Also refresh the asset list to show failure
                queryClient.invalidateQueries({
                  queryKey: [assetType],
                });
                break;
            }
          } catch (parseError) {
            console.error("Failed to parse global SSE message:", parseError);
          }
        };

        eventSource.onerror = (error) => {
          console.warn(
            "Global SSE connection error - will attempt to reconnect:",
            error,
          );
          setIsConnected(false);
          eventSource.close();

          // Increment reconnection attempts
          reconnectAttemptsRef.current += 1;

          // Only attempt to reconnect if under the limit
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            const delay = Math.min(
              1000 * 2 ** reconnectAttemptsRef.current,
              30000,
            ); // Exponential backoff, max 30s
            console.log(
              `SSE reconnection attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts} in ${delay}ms`,
            );

            reconnectTimeoutId = setTimeout(() => {
              if (eventSourceRef.current === eventSource) {
                connectSSE();
              }
            }, delay);
          } else {
            console.warn(
              "SSE max reconnection attempts reached. Real-time updates disabled.",
            );
          }
        };

        eventSourceRef.current = eventSource;
      } catch (error) {
        console.error("Failed to connect to global SSE:", error);
        setIsConnected(false);
        reconnectAttemptsRef.current += 1;
      }
    };

    connectSSE();

    return () => {
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsConnected(false);
    };
  }, [queryClient, session?.user]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  const registerRefreshCallback = useCallback(
    (assetType: AssetType, callback: () => void) => {
      refreshCallbacksRef.current.set(assetType, callback);

      // Return cleanup function
      return () => {
        refreshCallbacksRef.current.delete(assetType);
      };
    },
    [],
  );

  const value: ProcessingEventsContextType = {
    events,
    isConnected,
    clearEvents,
    registerRefreshCallback,
  };

  return (
    <ProcessingEventsContext.Provider value={value}>
      {children}
    </ProcessingEventsContext.Provider>
  );
}

export function useProcessingEvents(): ProcessingEventsContextType {
  const context = useContext(ProcessingEventsContext);
  if (!context) {
    throw new Error(
      "useProcessingEvents must be used within a ProcessingEventsProvider",
    );
  }
  return context;
}

// Helper hook to just get connection status without events
export function useSSEConnectionStatus(): { isConnected: boolean } {
  const context = useContext(ProcessingEventsContext);
  if (!context) {
    // Gracefully handle case where provider isn't available
    return { isConnected: false };
  }
  return { isConnected: context.isConnected };
}
