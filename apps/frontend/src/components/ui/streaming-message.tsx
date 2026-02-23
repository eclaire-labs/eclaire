import { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownDisplay } from "@/components/markdown-display";

interface StreamingMessageProps {
  content: string;
  isComplete?: boolean;
  showCursor?: boolean;
  typewriterSpeed?: number; // ms between characters
  enableTypewriter?: boolean;
  className?: string;
  onContentUpdate?: (content: string) => void;
}

export function StreamingMessage({
  content,
  isComplete = false,
  showCursor = true,
  typewriterSpeed = 30,
  enableTypewriter = false,
  className = "",
  onContentUpdate,
}: StreamingMessageProps) {
  const [displayedContent, setDisplayedContent] = useState("");
  const [showTypingCursor, setShowTypingCursor] = useState(false);
  const contentRef = useRef(content);
  const typewriterTimeoutRef = useRef<NodeJS.Timeout>(undefined);

  // Debug logging for content updates
  console.log("💬 StreamingMessage render:", {
    contentLength: content.length,
    contentPreview: content.substring(0, 50),
    displayedContentLength: displayedContent.length,
    isComplete,
    enableTypewriter,
    showCursor,
  });

  // Update content reference
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Typewriter effect
  useEffect(() => {
    if (!enableTypewriter) {
      setDisplayedContent(content);
      return;
    }

    if (content.length > displayedContent.length) {
      setShowTypingCursor(true);

      const typeNextCharacter = () => {
        setDisplayedContent((prev) => {
          const nextLength = Math.min(
            prev.length + 1,
            contentRef.current.length,
          );
          const newContent = contentRef.current.slice(0, nextLength);
          onContentUpdate?.(newContent);

          if (nextLength < contentRef.current.length) {
            typewriterTimeoutRef.current = setTimeout(
              typeNextCharacter,
              typewriterSpeed,
            );
          } else {
            setShowTypingCursor(false);
          }

          return newContent;
        });
      };

      // Clear any existing timeout
      if (typewriterTimeoutRef.current) {
        clearTimeout(typewriterTimeoutRef.current);
      }

      // Start typing
      typewriterTimeoutRef.current = setTimeout(
        typeNextCharacter,
        typewriterSpeed,
      );
    }

    return () => {
      if (typewriterTimeoutRef.current) {
        clearTimeout(typewriterTimeoutRef.current);
      }
    };
  }, [
    content,
    enableTypewriter,
    typewriterSpeed,
    onContentUpdate,
    displayedContent.length,
  ]);

  // Show cursor when not complete or when typing
  const shouldShowCursor = showCursor && (!isComplete || showTypingCursor);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (typewriterTimeoutRef.current) {
        clearTimeout(typewriterTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className={`relative ${className}`}>
      <MarkdownDisplay
        content={displayedContent}
        className="text-sm prose-sm"
      />
      {shouldShowCursor && (
        <span className="inline-block w-2 h-4 bg-primary ml-1 animate-pulse" />
      )}
    </div>
  );
}

// Hook for managing streaming message state
export function useStreamingMessage(initialContent: string = "") {
  const [content, setContent] = useState(initialContent);
  const [isComplete, setIsComplete] = useState(false);

  const appendContent = useCallback((newContent: string) => {
    setContent((prev) => prev + newContent);
  }, []);

  const setFullContent = useCallback((fullContent: string) => {
    setContent(fullContent);
  }, []);

  const markComplete = useCallback(() => {
    setIsComplete(true);
  }, []);

  const reset = useCallback((newInitialContent: string = "") => {
    setContent(newInitialContent);
    setIsComplete(false);
  }, []);

  return {
    content,
    isComplete,
    appendContent,
    setFullContent,
    markComplete,
    reset,
  };
}

// Streaming message container with progressive display
interface StreamingMessageContainerProps {
  thinkingContent?: string;
  isThinking?: boolean;
  textContent: string;
  isTextComplete?: boolean;
  toolCalls?: any[];
  enableTypewriter?: boolean;
  className?: string;
  onContentUpdate?: (content: string) => void;
}

export function StreamingMessageContainer({
  thinkingContent = "",
  isThinking = false,
  textContent,
  isTextComplete = false,
  toolCalls = [],
  enableTypewriter = true,
  className = "",
  onContentUpdate,
}: StreamingMessageContainerProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {/* Thinking content (if any) */}
      {(thinkingContent || isThinking) && (
        <div className="p-3 bg-muted/30 rounded-lg border border-dashed">
          <div className="flex items-center gap-2 mb-2">
            <div
              className={`w-2 h-2 rounded-full ${isThinking ? "bg-blue-500 animate-pulse" : "bg-gray-400"}`}
            />
            <span className="text-xs font-medium text-muted-foreground">
              {isThinking ? "Thinking..." : "Thought Process"}
            </span>
          </div>
          {thinkingContent && (
            <div className="text-sm text-muted-foreground font-mono whitespace-pre-wrap">
              {thinkingContent}
            </div>
          )}
        </div>
      )}

      {/* Tool execution (if any) */}
      {toolCalls.length > 0 && (
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-medium text-blue-700">
              Executing Tools...
            </span>
          </div>
          <div className="space-y-1">
            {toolCalls.map((tool) => (
              <div key={tool.name} className="text-sm text-blue-600">
                {tool.name} - {tool.status}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main text content */}
      {textContent && (
        <StreamingMessage
          content={textContent}
          isComplete={isTextComplete}
          enableTypewriter={enableTypewriter}
          onContentUpdate={onContentUpdate}
        />
      )}
    </div>
  );
}

// Real-time streaming message component that handles all stream events
interface RealTimeStreamingMessageProps {
  className?: string;
  enableTypewriter?: boolean;
  onFinalContent?: (content: string) => void;
}

export function RealTimeStreamingMessage({
  className = "",
  enableTypewriter = true,
  onFinalContent,
}: RealTimeStreamingMessageProps) {
  const [thinkingContent, setThinkingContent] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [textContent, setTextContent] = useState("");
  const [isTextComplete, setIsTextComplete] = useState(false);
  const [toolCalls, setToolCalls] = useState<any[]>([]);

  // Methods to be called from parent via ref
  const _addThinkingContent = useCallback((content: string) => {
    setThinkingContent((prev) => prev + content);
    setIsThinking(true);
  }, []);

  const _completeThinking = useCallback(() => {
    setIsThinking(false);
  }, []);

  const _addTextContent = useCallback((content: string) => {
    setTextContent((prev) => prev + content);
  }, []);

  const _completeText = useCallback(() => {
    setIsTextComplete(true);
    onFinalContent?.(textContent);
  }, [textContent, onFinalContent]);

  const _addToolCall = useCallback((name: string, status: string) => {
    setToolCalls((prev) => {
      const existing = prev.find((t) => t.name === name);
      if (existing) {
        return prev.map((t) => (t.name === name ? { ...t, status } : t));
      } else {
        return [...prev, { name, status }];
      }
    });
  }, []);

  const _reset = useCallback(() => {
    setThinkingContent("");
    setIsThinking(false);
    setTextContent("");
    setIsTextComplete(false);
    setToolCalls([]);
  }, []);

  return (
    <StreamingMessageContainer
      thinkingContent={thinkingContent}
      isThinking={isThinking}
      textContent={textContent}
      isTextComplete={isTextComplete}
      toolCalls={toolCalls}
      enableTypewriter={enableTypewriter}
      className={className}
      onContentUpdate={onFinalContent}
    />
  );
}
