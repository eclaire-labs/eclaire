import {
  Activity,
  AlertTriangle,
  BookMarked,
  Clock,
  FileText,
  Flag,
  History,
  Home,
  ImageIcon,
  ListTodo,
  Notebook,
  Pin,
  Search,
  Settings,
  Upload,
} from "lucide-react";
import { Link, usePathname, useRouter } from "@/lib/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { flushSync } from "react-dom";
import { GlobalAssistant } from "@/components/assistant/global-assistant";
import { TopBar } from "@/components/dashboard/top-bar";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";
import { MobileChatView } from "@/components/mobile/mobile-chat-view";
import { MobileFoldersView } from "@/components/mobile/mobile-folders-view";
import { MobileLayout } from "@/components/mobile/mobile-layout";
import type { MobileTab } from "@/components/mobile/mobile-tab-bar";
import { AssistantOverlay } from "@/components/ui/assistant-overlay";
import {
  type ToolCall,
  useToolExecutionTracker,
} from "@/components/ui/tool-execution-tracker";
import { MobileNavigationProvider } from "@/contexts/mobile-navigation-context";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  apiFetch,
  type BackendMessage,
  type ConversationSummary,
  type ConversationWithMessages,
  createConversation,
  deleteConversation,
  getConversations,
  getConversationWithMessages,
  type PromptRequest,
  sendPrompt,
  updateConversation,
} from "@/lib/frontend-api";
import {
  getMobileTabFromPathname,
  getRouteForMobileTab,
} from "@/lib/mobile-navigation";
import {
  StreamingClient,
  type StreamingRequest,
  useStreamingClient,
} from "@/lib/streaming-client";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";
import type { Bookmark as BookmarkType } from "@/types/bookmark";
import type { AssetReference, ContentLink, Message } from "@/types/message";
import { convertToToolCallSummary } from "@/types/message";
import packageJson from "../../../package.json";

function convertBackendMessage(msg: BackendMessage): Message {
  console.log("🔄 Converting backend message:", {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    contentLength: msg.content?.length || 0,
    thinkingContent: msg.thinkingContent,
    hasThinkingContent: !!msg.thinkingContent,
    toolCalls: msg.toolCalls,
    hasToolCalls: !!msg.toolCalls?.length,
  });

  const converted = {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.createdAt),
    thinkingContent: msg.thinkingContent,
    toolCalls: msg.toolCalls,
  };

  console.log("✅ Converted message:", converted);
  return converted;
}

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
  { name: "Settings", href: "/settings", icon: Settings, separator: true },
  // { name: "Feedback", href: "#", icon: MessageSquare, isDialog: true },
];

interface MainLayoutClientProps {
  children: ReactNode;
}

export function MainLayoutClient({ children }: MainLayoutClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantFullScreen, setAssistantFullScreen] = useState(false);
  const [preAttachedAssets, setPreAttachedAssets] = useState<AssetReference[]>(
    [],
  );
  const [assistantWidth, setAssistantWidth] = useState(384); // 96 * 4 = 384px (w-96 equivalent)
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);

  // Mobile state
  const [currentMobileTab, setCurrentMobileTab] = useState<MobileTab>("chat");
  const [foldersSheetOpen, setFoldersSheetOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Assistant preferences
  const [assistantPreferences, , preferencesLoaded] = useAssistantPreferences();

  // Assistant conversation state
  const [isClient, setIsClient] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachedAssets, setAttachedAssets] = useState<AssetReference[]>([]);
  const [currentConversation, setCurrentConversation] =
    useState<ConversationSummary | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
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

  // Streaming optimization state
  const [isPending, startTransition] = useTransition();
  const pendingChunksRef = useRef<string>("");
  const batchTimeoutRef = useRef<number | null>(null);
  const lastChunkTimeRef = useRef<number>(0);

  useEffect(() => {
    setIsClient(true);
  }, []);

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
          const newText = prev + chunksToFlush;
          console.log(
            `🔄 Batched update: "${prev}" + "${chunksToFlush}" = "${newText}"`,
          );
          console.log(`📊 streamingText length: ${newText.length} chars`);
          return newText;
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
    onThought: (content: string, timestamp?: string) => {
      console.log("💭 Received thought:", content);
      setStreamingThought((prev) => prev + content);
    },
    onToolCall: (
      name: string,
      status: "starting" | "executing" | "completed" | "error",
      args?: Record<string, any>,
      result?: any,
      error?: string,
    ) => {
      console.log("🔧 Received tool call:", name, status, {
        args,
        result,
        error,
      });
      addOrUpdateTool(name, status, args, result, error);
    },
    onTextChunk: (content: string, timestamp?: string) => {
      console.log("📝 Received text chunk:", content);
      finalStreamingTextRef.current += content; // <-- UPDATE THE REF IMMEDIATELY
      processBatchedChunk(content);
    },
    onError: (error: string, timestamp?: string) => {
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
      conversationId?: string,
      totalTokens?: number,
      executionTimeMs?: number,
    ) => {
      console.log("🏁 Streaming completed:", {
        requestId,
        conversationId,
        totalTokens,
        executionTimeMs,
      });

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

      // If this was the first message of a new conversation, the backend returns
      // a new conversationId. We use it to load the conversation details.
      if (conversationId && !currentConversation) {
        getConversationWithMessages(conversationId)
          .then((conversation) => {
            setCurrentConversation({
              id: conversation.id,
              userId: conversation.userId,
              title: conversation.title,
              createdAt: conversation.createdAt,
              updatedAt: conversation.updatedAt,
              lastMessageAt: conversation.lastMessageAt,
              messageCount: conversation.messageCount,
            });
          })
          .catch((error) => {
            console.error("Failed to load new conversation details:", error);
          });
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
    onConnect: () => {
      console.log("🔌 Streaming connected");
    },
    onDisconnect: () => {
      console.log("🔌 Streaming disconnected");
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
          content: `Hello! I can see you've attached ${preAttachedAssets.length > 1 ? `${preAttachedAssets.length} items` : `"${preAttachedAssets[0].title || preAttachedAssets[0].id}"`} to our conversation. How can I help you with ${preAttachedAssets.length > 1 ? "them" : "it"} today?`,
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    return () => {
      messages.forEach((message) => {
        if (message.imageUrl && message.imageUrl.startsWith("blob:")) {
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
      router.push(route);
    }

    // Handle tab-specific state changes
    if (tab === "folders") {
      setFoldersSheetOpen(true);
    } else {
      setFoldersSheetOpen(false);
    }

    // Chat tab doesn't need special state since it's handled by the content render
  };

  const handleFoldersToggle = () => {
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
    console.log("🔄 Loading conversation:", conversation.id);
    setIsLoadingConversation(true);
    try {
      const conversationWithMessages = await getConversationWithMessages(
        conversation.id,
      );
      console.log(
        "📨 API response messages:",
        conversationWithMessages.messages,
      );
      console.log(
        "📊 Message count:",
        conversationWithMessages.messages.length,
      );

      setCurrentConversation(conversation);
      const convertedMessages = conversationWithMessages.messages.map(
        convertBackendMessage,
      );
      console.log("🔄 All converted messages:", convertedMessages);

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
      const updatedConversation = await updateConversation(
        currentConversation.id,
        { title: newTitle },
      );
      setCurrentConversation(updatedConversation);
    } catch (error) {
      console.error("Failed to update conversation title:", error);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteConversation(id);
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
      const response = await getConversations(1000, 0);
      await Promise.all(
        response.conversations.map((c) => deleteConversation(c.id)),
      );
      startNewConversation();
    } catch (error) {
      console.error("Failed to delete all conversations:", error);
      throw error;
    }
  };

  const getDeviceInfo = () => ({
    userAgent: typeof window !== "undefined" ? window.navigator.userAgent : "",
    dateTime: new Date().toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screenWidth:
      typeof window !== "undefined" ? window.screen.width.toString() : "",
    screenHeight:
      typeof window !== "undefined" ? window.screen.height.toString() : "",
    app: { name: "Eclaire Frontend", version: packageJson.version },
  });

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
              assignedToId: task.assignedToId,
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

  const handleSend = async () => {
    if (!input.trim()) return;

    // Wait for preferences to be loaded to ensure correct enableThinking value
    if (!preferencesLoaded) {
      console.log("⏳ Waiting for preferences to load before sending message");
      return;
    }

    console.log("💬 Starting message send:", input);

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput("");

    // Check if streaming is enabled in preferences
    const useStreaming = assistantPreferences.streamingEnabled;
    console.log(
      `🔄 Using ${useStreaming ? "streaming" : "non-streaming"} mode`,
    );

    // Set loading state immediately for instant user feedback
    // Use flushSync to ensure immediate re-render
    if (useStreaming) {
      console.log("🔄 Setting isStreaming=true for immediate feedback");
      flushSync(() => {
        setIsStreaming(true);
        setStreamingThought("");
        setStreamingText("");
        finalStreamingTextRef.current = "";
        resetBatchingState();
      });
      clearTools();
      console.log(
        "✅ Streaming state set with flushSync, should show loading indicator",
      );
    } else {
      console.log("🔄 Setting isLoading=true for immediate feedback");
      flushSync(() => {
        setIsLoading(true);
      });
      console.log(
        "✅ Loading state set with flushSync, should show loading indicator",
      );
    }

    if (useStreaming) {
      // Streaming mode - prepare streaming request

      try {
        const streamingRequest: StreamingRequest = {
          prompt: currentInput,
          deviceInfo: getDeviceInfo(),
          enableThinking: assistantPreferences.showThinkingTokens,
        };

        if (currentConversation) {
          streamingRequest.conversationId = currentConversation.id;
          console.log(
            "📝 Using existing conversation:",
            currentConversation.id,
          );
        }

        if (attachedAssets.length > 0) {
          streamingRequest.context = {
            agent: "eclaire",
            assets: attachedAssets.map((asset) => ({
              type: asset.type,
              id: asset.id,
            })),
          };
          console.log("📎 Attached assets:", attachedAssets.length);
        }

        console.log("🚀 Starting streaming request:", streamingRequest);
        await streamingClient.startStream?.(streamingRequest);
        console.log("✅ Streaming request initiated");
      } catch (error) {
        console.error("❌ Streaming error:", error);
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
    } else {
      // Non-streaming mode - use regular API call to /api/prompt endpoint

      try {
        const promptRequest: PromptRequest = {
          prompt: currentInput,
          deviceInfo: getDeviceInfo(),
          enableThinking: assistantPreferences.showThinkingTokens,
        };

        if (currentConversation) {
          promptRequest.conversationId = currentConversation.id;
          console.log(
            "📝 Using existing conversation:",
            currentConversation.id,
          );
        }

        if (attachedAssets.length > 0) {
          promptRequest.context = {
            agent: "eclaire",
            assets: attachedAssets.map((asset) => ({
              type: asset.type,
              id: asset.id,
            })),
          };
          console.log("📎 Attached assets:", attachedAssets.length);
        }

        console.log(
          "🚀 Starting non-streaming request to /api/prompt:",
          promptRequest,
        );
        const response = await sendPrompt(promptRequest);
        console.log("✅ Non-streaming response received:", response);

        // Create assistant message with thinking content
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: response.response,
          timestamp: new Date(),
          thinkingContent: response.thinkingContent,
          toolCalls: response.toolCalls,
        };

        // Detect content links
        const detectedLinks = detectContentLinks(response.response);
        if (detectedLinks.length > 0) {
          assistantMessage.contentLinks = detectedLinks;
          setMessages((prev) => [...prev, assistantMessage]);
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
        } else {
          setMessages((prev) => [...prev, assistantMessage]);
        }

        // Update conversation if we have an ID
        if (response.conversationId && !currentConversation) {
          getConversationWithMessages(response.conversationId)
            .then((conversation) => {
              setCurrentConversation({
                id: conversation.id,
                userId: conversation.userId,
                title: conversation.title,
                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt,
                lastMessageAt: conversation.lastMessageAt,
                messageCount: conversation.messageCount,
              });
            })
            .catch((error) => {
              console.error("Failed to load new conversation:", error);
            });
        }
      } catch (error) {
        console.error("❌ Non-streaming error:", error);
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content:
            "I'm sorry, I encountered an error while processing your request. Please try again.",
          timestamp: new Date(),
          isError: true,
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startNewConversation = () => {
    messages.forEach((message) => {
      if (message.imageUrl && message.imageUrl.startsWith("blob:")) {
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
    streamingClient.disconnect?.();
  };

  // Make this function available globally
  if (typeof window !== "undefined") {
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
              isLoading={isLoading || isLoadingConversation}
              messagesEndRef={messagesEndRef}
              attachedAssets={attachedAssets}
              setAttachedAssets={setAttachedAssets}
              input={input}
              inputRef={inputRef}
              setInput={setInput}
              handleKeyDown={handleKeyDown}
              handleSend={handleSend}
              startNewConversation={startNewConversation}
              isClient={isClient}
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
                  {(item as any).isDialog ? (
                    <FeedbackDialog
                      trigger={
                        <button className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-[hsl(var(--hover-bg))] w-full text-left">
                          <item.icon className="h-4 w-4" />
                          <span>{item.name}</span>
                        </button>
                      }
                    />
                  ) : (
                    <Link
                      href={item.href}
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
              isLoading={isLoading || isLoadingConversation}
              messagesEndRef={messagesEndRef}
              attachedAssets={attachedAssets}
              setAttachedAssets={setAttachedAssets}
              input={input}
              inputRef={inputRef}
              setInput={setInput}
              handleKeyDown={handleKeyDown}
              handleSend={handleSend}
              startNewConversation={startNewConversation}
              isClient={isClient}
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
          isLoading={isLoading || isLoadingConversation}
          messagesEndRef={messagesEndRef}
          attachedAssets={attachedAssets}
          setAttachedAssets={setAttachedAssets}
          input={input}
          inputRef={inputRef}
          setInput={setInput}
          handleKeyDown={handleKeyDown}
          handleSend={handleSend}
          startNewConversation={startNewConversation}
          isClient={isClient}
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
            router.push("/tasks?openDialog=ai");
          }}
        />
      )}
    </div>
  );
}
