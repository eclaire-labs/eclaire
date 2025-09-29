"use client";

import { Brain, ChevronDown, ChevronRight } from "lucide-react";
import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ThinkingIndicatorProps {
  content: string;
  isActive?: boolean;
  timestamp?: string;
  className?: string;
}

export function ThinkingIndicator({
  content,
  isActive = false,
  timestamp,
  className = "",
}: ThinkingIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!content && !isActive) {
    return null;
  }

  return (
    <div
      className={`rounded-md border border-dashed border-muted-foreground/20 bg-muted/10 ${className}`}
    >
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full h-auto p-2 justify-start hover:bg-muted/20 text-xs"
          >
            <div className="flex items-center gap-2 w-full min-w-0">
              {/* Thinking icon with animation */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Brain
                  className={`h-3 w-3 text-muted-foreground/70 ${
                    isActive ? "animate-pulse text-blue-400" : ""
                  }`}
                />
                <Badge
                  variant="outline"
                  className="text-xs px-1.5 py-0.5 h-auto font-normal"
                >
                  {isActive ? "Thinking..." : "Thought Process"}
                </Badge>
              </div>

              {/* Content preview */}
              <div className="flex-1 min-w-0 text-left">
                {content && (
                  <p className="text-xs text-muted-foreground/80 truncate">
                    {content.slice(0, 60)}
                    {content.length > 60 ? "..." : ""}
                  </p>
                )}
              </div>

              {/* Expand/Collapse indicator */}
              <div className="flex items-center gap-1.5 text-muted-foreground/60 flex-shrink-0">
                {timestamp && (
                  <span className="text-xs opacity-60">
                    {new Date(timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </div>
            </div>
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="px-2 pb-2">
          <div className="mt-1 p-2 bg-muted/20 rounded border-l-2 border-muted-foreground/20">
            <div className="text-xs whitespace-pre-wrap text-muted-foreground/90 leading-relaxed max-w-full break-words">
              {content || (isActive ? "Processing..." : "")}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Streaming version that updates in real-time
interface StreamingThinkingIndicatorProps {
  onContentUpdate?: (content: string) => void;
  className?: string;
}

export function StreamingThinkingIndicator({
  onContentUpdate,
  className = "",
}: StreamingThinkingIndicatorProps) {
  const [content, setContent] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [timestamp, setTimestamp] = useState<string>();

  // Method to add new thinking content
  const addThinkingContent = React.useCallback(
    (newContent: string, eventTimestamp?: string) => {
      setContent((prev) => prev + newContent);
      setIsActive(true);
      if (eventTimestamp) {
        setTimestamp(eventTimestamp);
      }
      onContentUpdate?.(content + newContent);
    },
    [content, onContentUpdate],
  );

  // Method to mark thinking as complete
  const completeThinking = React.useCallback(() => {
    setIsActive(false);
  }, []);

  // Method to reset thinking state
  const resetThinking = React.useCallback(() => {
    setContent("");
    setIsActive(false);
    setTimestamp(undefined);
    onContentUpdate?.("");
  }, [onContentUpdate]);

  // Expose methods via ref
  React.useImperativeHandle(
    React.useRef<{
      addContent: (content: string, timestamp?: string) => void;
      complete: () => void;
      reset: () => void;
    }>(),
    () => ({
      addContent: addThinkingContent,
      complete: completeThinking,
      reset: resetThinking,
    }),
    [addThinkingContent, completeThinking, resetThinking],
  );

  return (
    <ThinkingIndicator
      content={content}
      isActive={isActive}
      timestamp={timestamp}
      className={className}
    />
  );
}
