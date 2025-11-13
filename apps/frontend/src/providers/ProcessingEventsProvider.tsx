"use client";

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

export interface ProcessingEvent {
  type:
    | "connected"
    | "ping"
    | "job_created"
    | "job_update"
    | "job_completed"
    | "job_failed"
    | "stage_update"
    | "error";
  payload?: {
    job?: any;
    summary?: any;
  };
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

            // Handle different event types by directly updating query data
            if (data.payload) {
              // Update processing summary if included
              if (data.payload.summary) {
                queryClient.setQueryData(
                  ["processing-summary"],
                  data.payload.summary,
                );
              }

              // Update processing jobs list
              if (data.payload.job) {
                const job = data.payload.job;

                // Update individual processing status query
                queryClient.setQueryData(
                  ["processing-status", job.assetType, job.assetId],
                  {
                    status: job.status,
                    stages: job.stages,
                    currentStage: job.currentStage,
                    overallProgress: job.overallProgress,
                    error: job.errorMessage,
                    errorDetails: job.errorDetails,
                    retryCount: job.retryCount,
                    canRetry: job.canRetry,
                    estimatedCompletion: job.estimatedCompletion,
                  },
                );

                // Update or add job in processing jobs list
                queryClient.setQueryData(
                  ["processing-jobs"],
                  (oldData: any) => {
                    if (!oldData) return [job];

                    const existingIndex = oldData.findIndex(
                      (j: any) => j.id === job.id,
                    );
                    if (existingIndex >= 0) {
                      // Update existing job
                      const newData = [...oldData];
                      newData[existingIndex] = job;
                      return newData;
                    } else {
                      // Add new job (for job_created events)
                      return [job, ...oldData];
                    }
                  },
                );

                // If processing is completed, invalidate asset content queries for fresh data
                if (
                  data.type === "job_completed" &&
                  job.status === "completed"
                ) {
                  // Invalidate general asset list queries to get updated content
                  queryClient.invalidateQueries({
                    queryKey: [job.assetType],
                  });

                  // Invalidate specific asset queries
                  queryClient.invalidateQueries({
                    queryKey: [job.assetType, job.assetId],
                  });

                  // For photos, also invalidate the AI analysis cache
                  if (job.assetType === "photos") {
                    queryClient.invalidateQueries({
                      queryKey: ["photo-analysis", job.assetId],
                    });
                  }

                  // Trigger any registered refresh callbacks for this asset type
                  const callback = refreshCallbacksRef.current.get(
                    job.assetType,
                  );
                  if (callback) {
                    callback();
                  }
                } else if (
                  job.assetType === "bookmarks" ||
                  job.assetType === "documents" ||
                  job.assetType === "photos" ||
                  job.assetType === "notes" ||
                  job.assetType === "tasks"
                ) {
                  // Also invalidate on status changes for bookmarks, documents, photos, notes, and tasks (not just completion)
                  // This ensures real-time processing status updates
                  queryClient.invalidateQueries({
                    queryKey: [job.assetType, job.assetId],
                  });

                  // When status changes to "processing", also invalidate the list query
                  // so the UI can display the processing state immediately
                  if (job.status === "processing") {
                    queryClient.invalidateQueries({
                      queryKey: [job.assetType],
                    });
                  }
                }
              }
            }
          } catch (parseError) {
            console.error("Failed to parse global SSE message:", parseError);
          }
        };

        eventSource.onerror = (error) => {
          console.warn(
            "Global SSE connection error - this is normal if Redis is not configured:",
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
