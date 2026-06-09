/**
 * Shared assistant chat core used by the main layout assistant and the
 * agent settings chat pane.
 *
 * Owns the full chat state machine: messages, input, attached assets, the
 * current conversation, streaming accumulation (thought + text with rAF
 * batching), the `useStreamingClient` wiring, the send handler with lazy
 * session creation, and the tool-approval approve/deny handlers.
 *
 * Behavior that genuinely differs between call sites (error surfacing,
 * content-link enrichment, draft-agent send guard, post-stream refresh) is
 * parameterized via {@link UseAssistantChatOptions}.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { useToolExecutionTracker } from "@/components/assistant/tool-execution-tracker";
import {
  abortSession,
  createSession,
  getSessionWithMessages,
  markSessionRead,
} from "@/lib/api-sessions";
import { detectContentLinks, fetchContentMetadata } from "@/lib/content-links";
import { convertBackendMessage } from "@/lib/message-utils";
import {
  type StreamingRequest,
  useStreamingClient,
} from "@/lib/streaming-client";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";
import type { ConversationSummary } from "@/types/conversation";
import type { AssetReference, Message } from "@/types/message";
import { convertToToolCallSummary } from "@/types/message";

export interface UseAssistantChatOptions {
  /** Agent the chat is pinned to; used for lazy session creation + context. */
  agentActorId: string;
  /** Seed message used when the conversation is reset. */
  buildWelcomeMessage: () => Message;
  /** When true, handleSend is a no-op (e.g. draft agent that isn't saved yet). */
  sendDisabled?: boolean;
  /**
   * When true, surface streaming/send/load errors via toast (settings
   * behavior). When false, errors are logged and rendered inline as an
   * assistant error message only (main layout behavior).
   */
  toastOnError?: boolean;
  /**
   * Detect content links (e.g. /documents/xyz) in the final response and
   * asynchronously enrich them with metadata (main layout behavior).
   */
  enrichContentLinks?: boolean;
  /** Clear attached assets when loading an existing conversation. */
  clearAttachmentsOnLoad?: boolean;
  /** Called after a conversation has been loaded (e.g. switch tab to chat). */
  onConversationLoaded?: (conversation: ConversationSummary) => void;
  /**
   * Called when a stream completes, after streaming state is reset and
   * before the session is marked read (e.g. refresh the sessions list).
   */
  onStreamDone?: () => void | Promise<void>;
}

export function useAssistantChat(options: UseAssistantChatOptions) {
  const queryClient = useQueryClient();
  const [preferences, , preferencesLoaded] = useAssistantPreferences();

  // Conversation state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [attachedAssets, setAttachedAssets] = useState<AssetReference[]>([]);
  const [currentConversation, setCurrentConversation] =
    useState<ConversationSummary | null>(null);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);

  // Streaming state (always enabled)
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingThought, setStreamingThought] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const finalStreamingTextRef = useRef("");
  const finalStreamingThoughtRef = useRef("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentConversationRef = useRef(currentConversation);
  currentConversationRef.current = currentConversation;

  const {
    toolCalls: streamingToolCalls,
    addOrUpdateTool,
    clearTools,
  } = useToolExecutionTracker();

  // Streaming optimization state: batch rapid text chunks behind rAF so the
  // UI stays responsive during fast token streams.
  const [, startTransition] = useTransition();
  const pendingChunksRef = useRef<string>("");
  const batchTimeoutRef = useRef<number | null>(null);
  const lastChunkTimeRef = useRef<number>(0);

  // Cleanup batching timeout on unmount
  useEffect(() => {
    return () => {
      if (batchTimeoutRef.current !== null) {
        window.cancelAnimationFrame(batchTimeoutRef.current);
        batchTimeoutRef.current = null;
      }
    };
  }, []);

  // Intelligent batching for streaming text chunks
  const flushPendingChunks = useCallback(() => {
    if (pendingChunksRef.current) {
      const chunksToFlush = pendingChunksRef.current;
      pendingChunksRef.current = "";

      startTransition(() => {
        setStreamingText((prev) => {
          return prev + chunksToFlush;
        });
      });
    }
    batchTimeoutRef.current = null;
  }, []);

  const processBatchedChunk = useCallback(
    (content: string) => {
      const now = performance.now();
      const timeSinceLastChunk = now - lastChunkTimeRef.current;
      lastChunkTimeRef.current = now;

      pendingChunksRef.current += content;

      // If chunks are coming rapidly (< 16ms apart), batch them
      // Otherwise, flush immediately for responsive UX
      if (timeSinceLastChunk < 16 && batchTimeoutRef.current === null) {
        batchTimeoutRef.current =
          window.requestAnimationFrame(flushPendingChunks);
      } else if (batchTimeoutRef.current === null) {
        // Immediate flush for responsive feel
        flushPendingChunks();
      }
    },
    [flushPendingChunks],
  );

  const resetBatchingState = useCallback(() => {
    pendingChunksRef.current = "";
    lastChunkTimeRef.current = 0;
    if (batchTimeoutRef.current !== null) {
      window.cancelAnimationFrame(batchTimeoutRef.current);
      batchTimeoutRef.current = null;
    }
  }, []);

  // Revoke blob image URLs when messages are replaced or the chat unmounts
  useEffect(() => {
    return () => {
      messages.forEach((message) => {
        if (message.imageUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(message.imageUrl);
        }
      });
    };
  }, [messages]);

  // Initialize streaming client
  const streamingClient = useStreamingClient({
    onThought: (content: string, _timestamp?: string) => {
      finalStreamingThoughtRef.current += content;
      setStreamingThought((prev) => prev + content);
    },
    onToolCall: (
      id: string | undefined,
      name: string,
      status: "starting" | "executing" | "completed" | "error",
      args?: Record<string, unknown>,
      result?: unknown,
      error?: string,
    ) => {
      addOrUpdateTool(id, name, status, args, result, error);
    },
    onApprovalRequired: (
      id: string,
      name: string,
      _label: string,
      args: Record<string, unknown>,
    ) => {
      addOrUpdateTool(id, name, "awaiting_approval", args);
    },
    onApprovalResolved: (
      id: string,
      name: string,
      approved: boolean,
      reason?: string,
    ) => {
      if (approved) {
        addOrUpdateTool(id, name, "executing");
      } else {
        addOrUpdateTool(
          id,
          name,
          "error",
          undefined,
          undefined,
          reason || "Denied by user",
        );
      }
    },
    onTextChunk: (content: string, _timestamp?: string) => {
      finalStreamingTextRef.current += content;
      processBatchedChunk(content);
    },
    onError: (error: string, _timestamp?: string) => {
      console.error("❌ Streaming error received:", error);
      setIsStreaming(false);
      if (options.toastOnError) {
        finalStreamingTextRef.current = "";
        finalStreamingThoughtRef.current = "";
        toast.error(error);
      }
      // Add error message to conversation
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: options.toastOnError ? error : `Error: ${error}`,
        timestamp: new Date(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    },
    onDone: async (
      requestId?: string,
      _conversationId?: string,
      _totalTokens?: number,
      _executionTimeMs?: number,
    ) => {
      // Flush any remaining batched chunks so the UI is fully up-to-date
      // before we finalize the message.
      flushPendingChunks();

      // Use the refs as the source of truth for the final message content.
      // This avoids the race condition where the 'streamingText' /
      // 'streamingThought' state might not be updated yet.
      const finalContent = finalStreamingTextRef.current.trim();
      const finalThought = finalStreamingThoughtRef.current.trim();

      // Only add a new message if we actually received content.
      if (finalContent) {
        const assistantMessage: Message = {
          id: requestId || `assistant-${Date.now()}`,
          role: "assistant",
          content: finalContent,
          timestamp: new Date(),
          thinkingContent: finalThought || null,
          // Persist the tool calls that were part of this streaming response.
          toolCalls:
            streamingToolCalls.length > 0
              ? streamingToolCalls.map(convertToToolCallSummary)
              : undefined,
        };

        // Check for any content links (e.g., /documents/xyz) in the response.
        const detectedLinks = options.enrichContentLinks
          ? detectContentLinks(finalContent)
          : [];
        if (detectedLinks.length > 0) {
          assistantMessage.contentLinks = detectedLinks;
        }

        // Use flushSync to synchronously update the DOM. This guarantees the
        // new message is rendered *before* we remove the "Thinking..."
        // indicator, preventing any UI flicker.
        flushSync(() => {
          setMessages((prev) => [...prev, assistantMessage]);
        });

        // If we found links, asynchronously fetch their rich metadata and
        // update the message again without blocking the UI.
        if (detectedLinks.length > 0) {
          Promise.all(detectedLinks.map(fetchContentMetadata)).then(
            (enrichedLinks) => {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessage.id
                    ? { ...msg, contentLinks: enrichedLinks }
                    : msg,
                ),
              );
            },
          );
        }
      }

      // Reset all streaming-related state to prepare for the next message.
      setIsStreaming(false);
      setStreamingThought("");
      setStreamingText("");
      finalStreamingTextRef.current = "";
      finalStreamingThoughtRef.current = "";
      resetBatchingState();
      clearTools();

      await options.onStreamDone?.();

      // User was watching the response — mark as read immediately
      const sessionId = currentConversationRef.current?.id;
      if (sessionId) {
        markSessionRead(sessionId).catch(() => {});
        queryClient.invalidateQueries({ queryKey: ["session-status"] });
      }
    },
    onDisconnect: () => {
      // Don't set isStreaming=false here - let onDone or onError handle it
      // This prevents premature clearing of loading state
    },
  });

  // Tool approval handlers
  const handleApproveToolCall = useCallback((toolCallId: string) => {
    const sessionId = currentConversationRef.current?.id;
    if (!sessionId) return;
    fetch(`/api/sessions/${sessionId}/approve-tool`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolCallId, approved: true }),
      credentials: "include",
    }).catch((err) => {
      console.error("Failed to approve tool execution:", err);
    });
  }, []);

  const handleDenyToolCall = useCallback((toolCallId: string) => {
    const sessionId = currentConversationRef.current?.id;
    if (!sessionId) return;
    fetch(`/api/sessions/${sessionId}/approve-tool`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolCallId, approved: false }),
      credentials: "include",
    }).catch((err) => {
      console.error("Failed to deny tool execution:", err);
    });
  }, []);

  const handleSend = async (textOverride?: string) => {
    const messageText = textOverride || input;
    if (!messageText.trim()) return;

    // Wait for preferences to be loaded to ensure correct enableThinking
    // value, and respect the caller's send guard (e.g. unsaved draft agent).
    if (!preferencesLoaded || options.sendDisabled) {
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    // Set loading state immediately for instant user feedback
    flushSync(() => {
      setIsStreaming(true);
      setStreamingThought("");
      setStreamingText("");
      finalStreamingTextRef.current = "";
      finalStreamingThoughtRef.current = "";
      resetBatchingState();
    });
    clearTools();

    try {
      // Lazy session creation on first message
      let sessionId = currentConversation?.id;
      if (!sessionId) {
        const session = await createSession({
          agentActorId: options.agentActorId,
        });
        sessionId = session.id;
        setCurrentConversation(session);
      }

      const streamingRequest: StreamingRequest = {
        sessionId,
        prompt: messageText,
        enableThinking: preferences.showThinkingTokens,
        context:
          attachedAssets.length > 0
            ? {
                agentActorId: options.agentActorId,
                assets: attachedAssets.map((asset) => ({
                  type: asset.type,
                  id: asset.id,
                })),
              }
            : { agentActorId: options.agentActorId },
      };

      await streamingClient.startStream(streamingRequest);
    } catch (error) {
      console.error("Streaming error:", error);
      setIsStreaming(false);
      if (options.toastOnError) {
        toast.error(
          error instanceof Error ? error.message : "Failed to send message",
        );
      } else {
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content:
            "I'm sorry, I encountered an error while processing your request. Please try again.",
          timestamp: new Date(),
          isError: true,
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    }
  };

  const loadConversation = async (conversation: ConversationSummary) => {
    setIsLoadingConversation(true);
    try {
      const conversationWithMessages = await getSessionWithMessages(
        conversation.id,
      );

      setCurrentConversation(conversation);
      setMessages(conversationWithMessages.messages.map(convertBackendMessage));
      if (options.clearAttachmentsOnLoad) {
        setAttachedAssets([]);
      }
      options.onConversationLoaded?.(conversation);

      // Clear unread indicator if the conversation had one
      if (conversation.hasUnreadResponse) {
        markSessionRead(conversation.id).catch(() => {});
        queryClient.invalidateQueries({ queryKey: ["session-status"] });
      }
    } catch (error) {
      console.error("Failed to load conversation:", error);
      if (options.toastOnError) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load conversation",
        );
      }
    } finally {
      setIsLoadingConversation(false);
    }
  };

  /** Abort server-side execution (if streaming) and close the stream. */
  const stopStreaming = () => {
    if (isStreaming && currentConversationRef.current?.id) {
      abortSession(currentConversationRef.current.id).catch(() => {});
    }
    streamingClient.disconnect();
  };

  /** Reset to a fresh conversation seeded with the welcome message. */
  const resetConversation = () => {
    messages.forEach((message) => {
      if (message.imageUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(message.imageUrl);
      }
    });
    setCurrentConversation(null);
    setAttachedAssets([]);
    setMessages([options.buildWelcomeMessage()]);

    // Reset streaming state
    setIsStreaming(false);
    setStreamingThought("");
    setStreamingText("");
    finalStreamingTextRef.current = "";
    finalStreamingThoughtRef.current = "";
    resetBatchingState();
    clearTools();
  };

  return {
    // Conversation state
    messages,
    setMessages,
    input,
    setInput,
    attachedAssets,
    setAttachedAssets,
    currentConversation,
    setCurrentConversation,
    isLoadingConversation,
    // Streaming state
    isStreaming,
    streamingThought,
    streamingText,
    streamingToolCalls,
    // Refs for chat UIs
    messagesEndRef,
    inputRef,
    // Handlers
    handleSend,
    handleApproveToolCall,
    handleDenyToolCall,
    loadConversation,
    resetConversation,
    stopStreaming,
  };
}

export type AssistantChat = ReturnType<typeof useAssistantChat>;
