import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { DEFAULT_AGENT_ACTOR_ID } from "@eclaire/api-types";
import {
  Activity,
  AlertTriangle,
  BookMarked,
  Bot,
  Clock,
  FileText,
  Flag,
  History,
  Home,
  ImageIcon,
  ListTodo,
  Notebook,
  Pin,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { flushSync } from "react-dom";
import { AssistantOverlay } from "@/components/assistant/assistant-overlay";
import { GlobalAssistant } from "@/components/assistant/global-assistant";
import { useToolExecutionTracker } from "@/components/assistant/tool-execution-tracker";
import { PopularTagsSection } from "@/components/dashboard/popular-tags-section";
import { TopBar } from "@/components/dashboard/top-bar";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";
import { MobileChatView } from "@/components/mobile/mobile-chat-view";
import { MobileFoldersView } from "@/components/mobile/mobile-folders-view";
import { MobileLayout } from "@/components/mobile/mobile-layout";
import type { MobileTab } from "@/components/mobile/mobile-tab-bar";
import { MobileNavigationProvider } from "@/contexts/mobile-navigation-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { listAgents } from "@/lib/api-agents";
import { apiFetch } from "@/lib/api-client";
import {
  abortSession,
  createSession,
  deleteSession,
  getSessionWithMessages,
  listSessions,
  updateSession,
} from "@/lib/api-sessions";
import {
  getMobileTabFromPathname,
  getRouteForMobileTab,
} from "@/lib/mobile-navigation";
import {
  type StreamingRequest,
  useStreamingClient,
} from "@/lib/streaming-client";
import { convertBackendMessage } from "@/lib/message-utils";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";
import type { Agent } from "@/types/agent";
import type { Bookmark as BookmarkType } from "@/types/bookmark";
import type { ConversationSummary } from "@/types/conversation";
import type { AssetReference, ContentLink, Message } from "@/types/message";
import { convertToToolCallSummary } from "@/types/message";

// Define navigation items outside the component for better structure
const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Processing", href: "/processing", icon: Activity },
  { name: "Upload", href: "/upload", icon: Upload, separator: true },
  { name: "All", href: "/all", icon: Search, separator: true },
  { name: "Pending", href: "/all/pending", icon: Clock },
  { name: "Due Now", href: "/all/due-now", icon: AlertTriangle },
  { name: "Pinned", href: "/all/pinned", icon: Pin },
  { name: "Flagged", href: "/all/flagged", icon: Flag },
  { name: "Tasks", href: "/tasks", icon: ListTodo, separator: true },
  { name: "Notes", href: "/notes", icon: Notebook },
  { name: "Bookmarks", href: "/bookmarks", icon: BookMarked },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Photos", href: "/photos", icon: ImageIcon },
  { name: "History", href: "/history", icon: History },
];

interface MainLayoutClientProps {
  children: ReactNode;
}

export function MainLayoutClient({ children }: MainLayoutClientProps) {
  const location = useLocation();
  const { pathname } = location;
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const search = location.search as {
    tab?: string;
    agentActorId?: string;
  };
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantFullScreen, setAssistantFullScreen] = useState(false);
  const [preAttachedAssets, setPreAttachedAssets] = useState<AssetReference[]>(
    [],
  );
  const [assistantWidth, setAssistantWidth] = useState(384); // 96 * 4 = 384px (w-96 equivalent)
  const [isResizing, setIsResizing] = useState(false);
  const _resizeRef = useRef<HTMLDivElement>(null);

  // Mobile state
  const [currentMobileTab, setCurrentMobileTab] = useState<MobileTab>("chat");
  const [foldersSheetOpen, setFoldersSheetOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Assistant preferences
  const [assistantPreferences, , preferencesLoaded] = useAssistantPreferences();

  // Assistant conversation state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [attachedAssets, setAttachedAssets] = useState<AssetReference[]>([]);
  const [currentConversation, setCurrentConversation] =
    useState<ConversationSummary | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [agentRailItems, setAgentRailItems] = useState<Agent[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Streaming state (always enabled)
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingThought, setStreamingThought] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const finalStreamingTextRef = useRef<string>("");
  const {
    toolCalls: streamingToolCalls,
    addOrUpdateTool,
    clearTools,
  } = useToolExecutionTracker();

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const response = await listAgents();
        setAgentRailItems(response.items);
      } catch (error) {
        console.error("Failed to load agents:", error);
      }
    };

    loadAgents();
    window.addEventListener("agents-updated", loadAgents);

    return () => {
      window.removeEventListener("agents-updated", loadAgents);
    };
  }, []);

  // Streaming optimization state
  const [_isPending, startTransition] = useTransition();
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

  // Initialize streaming client
  const streamingClient = useStreamingClient({
    onThought: (content: string, _timestamp?: string) => {
      setStreamingThought((prev) => prev + content);
    },
    onToolCall: (
      name: string,
      status: "starting" | "executing" | "completed" | "error",
      args?: Record<string, unknown>,
      result?: unknown,
      error?: string,
    ) => {
      addOrUpdateTool(name, status, args, result, error);
    },
    onTextChunk: (content: string, _timestamp?: string) => {
      finalStreamingTextRef.current += content;
      processBatchedChunk(content);
    },
    onError: (error: string, _timestamp?: string) => {
      console.error("❌ Streaming error received:", error);
      setIsStreaming(false);
      // Add error message to conversation
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Error: ${error}`,
        timestamp: new Date(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    },
    onDone: (
      requestId?: string,
      _conversationId?: string,
      _totalTokens?: number,
      _executionTimeMs?: number,
    ) => {
      // It's good practice to flush any remaining batched chunks to ensure the UI is
      // fully up-to-date before we finalize the message.
      flushPendingChunks();

      // *** FIX: Use the ref as the source of truth for the final message content. ***
      // This avoids the race condition where the 'streamingText' state might not be updated yet.
      const finalContent = finalStreamingTextRef.current.trim();
      const finalThought = streamingThought.trim();

      // Only add a new message if we actually received content.
      if (finalContent) {
        // Construct the final assistant message object.
        const assistantMessage: Message = {
          id: requestId || (Date.now() + 1).toString(),
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

        // Check for any content links (e.g., /documents/xyz) in the final response.
        const detectedLinks = detectContentLinks(finalContent);
        if (detectedLinks.length > 0) {
          assistantMessage.contentLinks = detectedLinks;
        }

        // *** FIX: Use flushSync to synchronously update the DOM. ***
        // This guarantees that the new message is rendered *before* we remove the
        // "Thinking..." indicator, preventing any UI flicker.
        flushSync(() => {
          setMessages((prev) => [...prev, assistantMessage]);
        });

        // If we found links, we can now asynchronously fetch their rich metadata
        // and update the message again without blocking the UI.
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

      // --- Final Cleanup ---
      // Reset all streaming-related state to prepare for the next user message.
      setIsStreaming(false);
      setStreamingThought("");
      setStreamingText("");
      finalStreamingTextRef.current = ""; // <-- CRUCIAL: Reset the ref for the next message.
      resetBatchingState();
      clearTools();
    },
    onConnect: () => {},
    onDisconnect: () => {
      // Don't set isStreaming=false here - let onDone or onError handle it
      // This prevents premature clearing of loading state
    },
  });

  useEffect(() => {
    if (assistantOpen && !currentConversation) {
      if (preAttachedAssets && preAttachedAssets.length > 0) {
        setAttachedAssets(preAttachedAssets);
        const welcomeMessage: Message = {
          id: "welcome",
          role: "assistant",
          content: `Hello! I can see you've attached ${preAttachedAssets.length > 1 ? `${preAttachedAssets.length} items` : `"${preAttachedAssets[0]?.title ?? preAttachedAssets[0]?.id ?? "item"}"`} to our conversation. How can I help you with ${preAttachedAssets.length > 1 ? "them" : "it"} today?`,
          timestamp: new Date(),
        };
        setMessages([welcomeMessage]);
      } else {
        const welcomeMessage: Message = {
          id: "welcome",
          role: "assistant",
          content: "Hello! I'm your AI assistant. How can I help you today?",
          timestamp: new Date(),
        };
        setMessages([welcomeMessage]);
      }
    }
  }, [preAttachedAssets, assistantOpen, currentConversation]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  useEffect(() => {
    return () => {
      messages.forEach((message) => {
        if (message.imageUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(message.imageUrl);
        }
      });
    };
  }, [messages]);

  // Mobile tab management
  useEffect(() => {
    if (isMobile) {
      // Update mobile tab based on current pathname
      const newTab = getMobileTabFromPathname(pathname);
      setCurrentMobileTab(newTab);
    }
  }, [pathname, isMobile]);

  const handleMobileTabChange = (tab: MobileTab) => {
    setCurrentMobileTab(tab);

    // Handle navigation for tabs that have routes
    const route = getRouteForMobileTab(tab);
    if (route && pathname !== route) {
      navigate({ to: route });
    }

    // Handle tab-specific state changes
    if (tab === "folders") {
      setFoldersSheetOpen(true);
    } else {
      setFoldersSheetOpen(false);
    }

    // Chat tab doesn't need special state since it's handled by the content render
  };

  const _handleFoldersToggle = () => {
    setFoldersSheetOpen(!foldersSheetOpen);
  };

  const isActive = (path: string) => {
    // Handle exact matches first for specificity
    if (pathname === path) return true;

    // Special handling for nested routes under /all
    if (path === "/all" && pathname.startsWith("/all/")) return false; // Don't show /all as active when on /all/pending or /all/pinned

    // Handle other paths starting with the href (but not for /all or /dashboard)
    if (path !== "/dashboard" && path !== "/all" && pathname.startsWith(path))
      return true;

    return false;
  };

  const activeAgentId = pathname.startsWith("/agents/")
    ? pathname.split("/")[2] || DEFAULT_AGENT_ACTOR_ID
    : pathname === "/settings" && search.tab === "assistant"
      ? search.agentActorId || DEFAULT_AGENT_ACTOR_ID
      : null;

  // Function to open assistant with pre-attached assets
  const openAssistantWithAssets = (assets: AssetReference[]) => {
    setPreAttachedAssets(assets);
    setAssistantOpen(true);
  };

  // Function to toggle full-screen mode
  const toggleAssistantFullScreen = () => {
    if (!assistantOpen) {
      setAssistantOpen(true);
      setAssistantFullScreen(true);
    } else if (assistantFullScreen) {
      // When exiting fullscreen, return to panel mode
      setAssistantFullScreen(false);
    } else {
      // When entering fullscreen from panel mode
      setAssistantFullScreen(true);
    }
  };

  // Function to close assistant completely from fullscreen mode
  const closeAssistantFromFullScreen = () => {
    setAssistantOpen(false);
    setAssistantFullScreen(false);
    setPreAttachedAssets([]);
  };

  // Conversation management functions
  const loadConversation = async (conversation: ConversationSummary) => {
    setIsLoadingConversation(true);
    try {
      const conversationWithMessages = await getSessionWithMessages(
        conversation.id,
      );

      setCurrentConversation(conversation);
      const convertedMessages = conversationWithMessages.messages.map(
        convertBackendMessage,
      );

      setMessages(convertedMessages);
      setAttachedAssets([]);
    } catch (error) {
      console.error("Failed to load conversation:", error);
    } finally {
      setIsLoadingConversation(false);
    }
  };

  const handleSelectConversation = (conversation: ConversationSummary) => {
    loadConversation(conversation);
  };

  const handleEditConversationTitle = async (newTitle: string) => {
    if (!currentConversation) return;
    try {
      const updatedSession = await updateSession(currentConversation.id, {
        title: newTitle,
      });
      setCurrentConversation(updatedSession);
    } catch (error) {
      console.error("Failed to update conversation title:", error);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteSession(id);
      if (currentConversation?.id === id) {
        startNewConversation();
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      throw error;
    }
  };

  const handleDeleteAllConversations = async () => {
    try {
      const response = await listSessions(1000, 0, DEFAULT_AGENT_ACTOR_ID);
      await Promise.all(response.items.map((c) => deleteSession(c.id)));
      startNewConversation();
    } catch (error) {
      console.error("Failed to delete all conversations:", error);
      throw error;
    }
  };

  const detectContentLinks = (text: string): ContentLink[] => {
    const links: ContentLink[] = [];
    const linkPattern =
      /(\/(?:bookmarks|documents|photos|tasks|notes)\/[a-zA-Z0-9_-]+)/g;
    const matches = text.match(linkPattern);
    if (matches) {
      matches.forEach((match) => {
        const [, type, id] = match.split("/");
        if (type && id) {
          links.push({
            type: type.slice(0, -1) as ContentLink["type"],
            id,
            url: match,
            title: `${type.slice(0, -1)} ${id}`,
          });
        }
      });
    }
    return links;
  };

  const fetchContentMetadata = async (
    link: ContentLink,
  ): Promise<ContentLink> => {
    try {
      if (link.type === "bookmark") {
        const response = await apiFetch(`/api/bookmarks/${link.id}`);
        if (response.ok) {
          const bookmark: BookmarkType = await response.json();
          return {
            ...link,
            title: bookmark.title || "Untitled Bookmark",
            description: bookmark.description || "No description available",
            metadata: {
              originalUrl: bookmark.url,
              tags: bookmark.tags,
              status: bookmark.processingStatus,
              createdAt: bookmark.createdAt,
              author: bookmark.author,
              faviconStorageId: bookmark.faviconUrl,
              screenshotDesktopStorageId: bookmark.thumbnailUrl,
              reviewStatus: bookmark.reviewStatus,
              flagColor: bookmark.flagColor,
              isPinned: bookmark.isPinned,
            },
          };
        }
      } else if (link.type === "document") {
        const response = await apiFetch(`/api/documents/${link.id}`);
        if (response.ok) {
          const document = await response.json();
          return {
            ...link,
            title: document.title || "Untitled Document",
            description: document.description || "No description available",
            metadata: {
              originalFilename: document.originalFilename,
              mimeType: document.mimeType,
              fileSize: document.fileSize,
              fileUrl: document.fileUrl,
              thumbnailUrl: document.thumbnailUrl,
              screenshotUrl: document.screenshotUrl,
              pdfUrl: document.pdfUrl,
              contentUrl: document.contentUrl,
              tags: document.tags,
              status: document.processingStatus,
              createdAt: document.createdAt,
              reviewStatus: document.reviewStatus,
              flagColor: document.flagColor,
              isPinned: document.isPinned,
              dueDate: document.dueDate,
            },
          };
        }
      } else if (link.type === "photo") {
        const response = await apiFetch(`/api/photos/${link.id}`);
        if (response.ok) {
          const photo = await response.json();
          return {
            ...link,
            title: photo.title || "Untitled Photo",
            description: photo.description || "No description available",
            metadata: {
              originalFilename: photo.originalFilename,
              mimeType: photo.mimeType,
              fileSize: photo.fileSize,
              imageUrl: photo.imageUrl,
              thumbnailUrl: photo.thumbnailUrl,
              originalUrl: photo.originalUrl,
              convertedJpgUrl: photo.convertedJpgUrl,
              imageWidth: photo.imageWidth,
              imageHeight: photo.imageHeight,
              cameraMake: photo.cameraMake,
              cameraModel: photo.cameraModel,
              lensModel: photo.lensModel,
              iso: photo.iso,
              fNumber: photo.fNumber,
              exposureTime: photo.exposureTime,
              latitude: photo.latitude,
              longitude: photo.longitude,
              locationCity: photo.locationCity,
              locationCountryName: photo.locationCountryName,
              photoType: photo.photoType,
              ocrText: photo.ocrText,
              dominantColors: photo.dominantColors,
              tags: photo.tags,
              status: photo.processingStatus,
              createdAt: photo.createdAt,
              reviewStatus: photo.reviewStatus,
              flagColor: photo.flagColor,
              isPinned: photo.isPinned,
              dueDate: photo.dueDate,
              dateTaken: photo.dateTaken,
            },
          };
        }
      } else if (link.type === "task") {
        const response = await apiFetch(`/api/tasks/${link.id}`);
        if (response.ok) {
          const task = await response.json();
          return {
            ...link,
            title: task.title || "Untitled Task",
            description: task.description || "No description available",
            metadata: {
              status: task.status,
              dueDate: task.dueDate,
              assigneeActorId: task.assigneeActorId,
              tags: task.tags,
              processingStatus: task.processingStatus,
              createdAt: task.createdAt,
              reviewStatus: task.reviewStatus,
              flagColor: task.flagColor,
              isPinned: task.isPinned,
              isRecurring: task.isRecurring,
              cronExpression: task.cronExpression,
              nextRunAt: task.nextRunAt,
              lastRunAt: task.lastRunAt,
              completedAt: task.completedAt,
            },
          };
        }
      } else if (link.type === "note") {
        const response = await apiFetch(`/api/notes/${link.id}`);
        if (response.ok) {
          const note = await response.json();
          return {
            ...link,
            title: note.title || "Untitled Note",
            description:
              note.description ||
              note.content?.substring(0, 200) +
                (note.content?.length > 200 ? "..." : "") ||
              "No content available",
            metadata: {
              content: note.content,
              tags: note.tags,
              status: note.processingStatus,
              createdAt: note.createdAt,
              reviewStatus: note.reviewStatus,
              flagColor: note.flagColor,
              isPinned: note.isPinned,
              dueDate: note.dueDate,
              originalMimeType: note.originalMimeType,
            },
          };
        }
      }
    } catch (error) {
      console.error("Failed to fetch metadata for link:", link, error);
    }
    return link;
  };

  const handleSend = async (textOverride?: string) => {
    const messageText = textOverride || input;
    if (!messageText.trim()) return;

    // Wait for preferences to be loaded to ensure correct enableThinking value
    if (!preferencesLoaded) {
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    const currentInput = messageText;
    setInput("");

    // Set loading state immediately for instant user feedback
    flushSync(() => {
      setIsStreaming(true);
      setStreamingThought("");
      setStreamingText("");
      finalStreamingTextRef.current = "";
      resetBatchingState();
    });
    clearTools();

    try {
      // Lazy session creation on first message
      let sessionId = currentConversation?.id;
      if (!sessionId) {
        const session = await createSession({
          agentActorId: DEFAULT_AGENT_ACTOR_ID,
        });
        sessionId = session.id;
        setCurrentConversation(session);
      }

      const streamingRequest: StreamingRequest = {
        sessionId,
        prompt: currentInput,
        enableThinking: assistantPreferences.showThinkingTokens,
        context:
          attachedAssets.length > 0
            ? {
                agentActorId: DEFAULT_AGENT_ACTOR_ID,
                assets: attachedAssets.map((asset) => ({
                  type: asset.type,
                  id: asset.id,
                })),
              }
            : { agentActorId: DEFAULT_AGENT_ACTOR_ID },
      };

      await streamingClient.startStream?.(streamingRequest);
    } catch (error) {
      console.error("Streaming error:", error);
      setIsStreaming(false);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "I'm sorry, I encountered an error while processing your request. Please try again.",
        timestamp: new Date(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startNewConversation = () => {
    // Abort server-side execution if streaming
    if (isStreaming && currentConversation?.id) {
      abortSession(currentConversation.id).catch(() => {});
    }
    streamingClient.disconnect?.();

    messages.forEach((message) => {
      if (message.imageUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(message.imageUrl);
      }
    });
    setCurrentConversation(null);
    setAttachedAssets([]);
    setMessages([
      {
        id: Date.now().toString(),
        role: "assistant",
        content: "Hello! I'm your AI assistant. How can I help you today?",
        timestamp: new Date(),
      },
    ]);

    // Reset streaming state
    setIsStreaming(false);
    setStreamingThought("");
    setStreamingText("");
    finalStreamingTextRef.current = "";
    resetBatchingState();
    clearTools();
  };

  // Make this function available globally
  if (typeof window !== "undefined") {
    // biome-ignore lint/suspicious/noExplicitAny: global window extension for assistant
    (window as any).openAssistantWithAssets = openAssistantWithAssets;
  }

  // Resize functionality
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      const containerRect = document
        .querySelector(".main-layout-container")
        ?.getBoundingClientRect();
      if (!containerRect) return;

      // Calculate new width from the right edge of the container
      const newWidth = containerRect.right - e.clientX;

      // Set min and max constraints (280px min, 800px max)
      const minWidth = 280;
      const maxWidth = 800;
      const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

      setAssistantWidth(constrainedWidth);
    },
    [isResizing],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      // Prevent text selection while resizing
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Conditional rendering for mobile vs desktop
  if (isMobile) {
    // Render different content based on active mobile tab
    const renderMobileContent = () => {
      switch (currentMobileTab) {
        case "chat":
          return (
            <MobileChatView
              messages={messages}
              isLoading={isLoadingConversation}
              messagesEndRef={messagesEndRef}
              attachedAssets={attachedAssets}
              setAttachedAssets={setAttachedAssets}
              input={input}
              inputRef={inputRef}
              setInput={setInput}
              handleKeyDown={handleKeyDown}
              handleSend={handleSend}
              startNewConversation={startNewConversation}
              currentConversation={currentConversation}
              onEditConversationTitle={handleEditConversationTitle}
              onSelectConversation={handleSelectConversation}
              onDeleteConversation={handleDeleteConversation}
              onDeleteAllConversations={handleDeleteAllConversations}
              isStreaming={isStreaming}
              streamingThought={streamingThought}
              streamingText={streamingText}
              streamingToolCalls={streamingToolCalls}
              showThinkingTokens={assistantPreferences.showThinkingTokens}
            />
          );
        case "folders":
          return (
            <>
              <main className="p-4">{children}</main>
              <MobileFoldersView
                open={foldersSheetOpen}
                onClose={() => {
                  setFoldersSheetOpen(false);
                  setCurrentMobileTab("chat");
                }}
              />
            </>
          );
        default:
          // home, settings, or any other tab shows regular content
          return <main className="p-4">{children}</main>;
      }
    };

    return (
      <MobileNavigationProvider
        value={{
          currentMobileTab,
          setCurrentMobileTab,
          foldersSheetOpen,
          setFoldersSheetOpen,
          chatOpen,
          setChatOpen,
        }}
      >
        <MobileLayout
          activeTab={currentMobileTab}
          onTabChange={handleMobileTabChange}
          onChatToggle={() => {
            setCurrentMobileTab("chat");
          }}
          onFoldersToggle={() => {
            setCurrentMobileTab("folders");
            setFoldersSheetOpen(true);
          }}
        >
          {renderMobileContent()}
        </MobileLayout>
      </MobileNavigationProvider>
    );
  }

  // Desktop layout (original)
  return (
    <div className="flex flex-col h-screen">
      {/* Top Bar */}
      <div className="sticky top-0 z-50">
        <TopBar
          onAssistantToggle={() => setAssistantOpen(!assistantOpen)}
          assistantOpen={assistantOpen}
          onAssistantFullScreenToggle={toggleAssistantFullScreen}
          assistantFullScreen={assistantFullScreen}
        />
      </div>

      {/* Main Content (3-column layout) */}
      <div className="flex flex-1 overflow-hidden main-layout-container">
        {/* Left Sidebar */}
        <div className="w-48 border-r bg-background overflow-y-auto flex-shrink-0">
          <nav className="p-3">
            <ul className="space-y-1">
              {navigation.map((item) => (
                <li key={item.name}>
                  {item.separator && (
                    <div className="h-px bg-border my-2"></div>
                  )}
                  {(item as Record<string, unknown>).isDialog ? (
                    <FeedbackDialog
                      trigger={
                        <button
                          type="button"
                          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-[hsl(var(--hover-bg))] w-full text-left"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.name}</span>
                        </button>
                      }
                    />
                  ) : (
                    <Link
                      to={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm ${
                        isActive(item.href)
                          ? "font-medium"
                          : "text-muted-foreground hover:bg-[hsl(var(--hover-bg))]"
                      }`}
                      style={
                        isActive(item.href)
                          ? {
                              backgroundColor: `hsl(var(--sidebar-active-bg) / var(--sidebar-active-bg-opacity))`,
                              color: `hsl(var(--sidebar-active-text))`,
                            }
                          : undefined
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.name}</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between px-3">
                <Link
                  to="/agents/$agentId"
                  params={{ agentId: DEFAULT_AGENT_ACTOR_ID }}
                  className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  <Bot className="h-3.5 w-3.5" />
                  Agents
                </Link>
                <Link
                  to="/agents/$agentId"
                  params={{ agentId: "new" }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-[hsl(var(--hover-bg))] hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                </Link>
              </div>
              <div className="space-y-1">
                {agentRailItems.map((agent) => (
                  <Link
                    key={agent.id}
                    to="/agents/$agentId"
                    params={{ agentId: agent.id }}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                      activeAgentId === agent.id
                        ? "font-medium"
                        : "text-muted-foreground hover:bg-[hsl(var(--hover-bg))]"
                    }`}
                    style={
                      activeAgentId === agent.id
                        ? {
                            backgroundColor: `hsl(var(--sidebar-active-bg) / var(--sidebar-active-bg-opacity))`,
                            color: `hsl(var(--sidebar-active-text))`,
                          }
                        : undefined
                    }
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border bg-background text-[11px] font-semibold">
                      {agent.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate">{agent.name}</span>
                  </Link>
                ))}
              </div>
            </div>
            <PopularTagsSection />
          </nav>
        </div>

        {/* Middle Content */}
        <div className="flex-1 overflow-y-auto">
          <main className="p-6">{children}</main>
        </div>

        {/* Right Sidebar (Assistant) - conditionally rendered only when not in full-screen */}
        {assistantOpen && !assistantFullScreen && (
          <div
            className="border-l bg-background overflow-y-auto flex-shrink-0 relative"
            style={{ width: assistantWidth }}
          >
            {/* Resize Handle - spans full height with higher z-index */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: resize handle uses mouse drag, not a clickable interactive element */}
            <div
              className={`absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/20 ${
                isResizing ? "bg-primary/40" : ""
              } transition-colors z-50`}
              onMouseDown={handleMouseDown}
              style={{ marginLeft: "-4px" }} // Offset to center the handle on the border
              title="Drag to resize assistant panel"
            />
            <GlobalAssistant
              open={assistantOpen}
              onOpenChange={(open) => {
                setAssistantOpen(open);
                if (!open) {
                  // Clear pre-attached assets when closing
                  setPreAttachedAssets([]);
                  // Also exit full-screen mode when closing
                  setAssistantFullScreen(false);
                }
              }}
              fullScreen={assistantFullScreen}
              onFullScreenToggle={toggleAssistantFullScreen}
              // Pass all conversation state
              messages={messages}
              isLoading={isLoadingConversation}
              messagesEndRef={messagesEndRef}
              attachedAssets={attachedAssets}
              setAttachedAssets={setAttachedAssets}
              input={input}
              inputRef={inputRef}
              setInput={setInput}
              handleKeyDown={handleKeyDown}
              handleSend={handleSend}
              startNewConversation={startNewConversation}
              currentConversation={currentConversation}
              onEditConversationTitle={handleEditConversationTitle}
              onShowHistory={() => setShowHistory(true)}
              showHistory={showHistory}
              onSetShowHistory={setShowHistory}
              onSelectConversation={handleSelectConversation}
              onDeleteConversation={handleDeleteConversation}
              onDeleteAllConversations={handleDeleteAllConversations}
              // Streaming props (always enabled)
              isStreaming={isStreaming}
              streamingThought={streamingThought}
              streamingText={streamingText}
              streamingToolCalls={streamingToolCalls}
              showThinkingTokens={assistantPreferences.showThinkingTokens}
            />
          </div>
        )}
      </div>

      {/* Full-Screen Assistant - rendered outside main layout */}
      {assistantOpen && assistantFullScreen && (
        <GlobalAssistant
          open={assistantOpen}
          onOpenChange={closeAssistantFromFullScreen}
          fullScreen={assistantFullScreen}
          onFullScreenToggle={toggleAssistantFullScreen}
          // Pass all conversation state
          messages={messages}
          isLoading={isLoadingConversation}
          messagesEndRef={messagesEndRef}
          attachedAssets={attachedAssets}
          setAttachedAssets={setAttachedAssets}
          input={input}
          inputRef={inputRef}
          setInput={setInput}
          handleKeyDown={handleKeyDown}
          handleSend={handleSend}
          startNewConversation={startNewConversation}
          currentConversation={currentConversation}
          onEditConversationTitle={handleEditConversationTitle}
          onShowHistory={() => setShowHistory(true)}
          showHistory={showHistory}
          onSetShowHistory={setShowHistory}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          onDeleteAllConversations={handleDeleteAllConversations}
          // Streaming props (always enabled)
          isStreaming={isStreaming}
          streamingThought={streamingThought}
          streamingText={streamingText}
          streamingToolCalls={streamingToolCalls}
          showThinkingTokens={assistantPreferences.showThinkingTokens}
        />
      )}

      {/* Assistant Overlay - shown when assistant is not visible and overlay is enabled */}
      {!assistantOpen && assistantPreferences.showAssistantOverlay && (
        <AssistantOverlay
          onFullScreenChat={() => {
            setAssistantOpen(true);
            setAssistantFullScreen(true);
          }}
          onWindowedChat={() => {
            setAssistantOpen(true);
            setAssistantFullScreen(false);
          }}
          onAssignTask={() => {
            // Navigate to tasks page with parameter to open dialog
            navigate({ to: "/tasks", search: { openDialog: "ai" } });
          }}
        />
      )}
    </div>
  );
}
