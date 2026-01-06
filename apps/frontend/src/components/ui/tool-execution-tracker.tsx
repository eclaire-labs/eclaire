import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Play,
  Settings,
} from "lucide-react";
import React, { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// Tool execution status
export type ToolStatus = "starting" | "executing" | "completed" | "error";

// Tool call information
export interface ToolCall {
  id: string;
  name: string;
  status: ToolStatus;
  arguments?: Record<string, any>;
  result?: any;
  error?: string;
  startTime?: Date;
  endTime?: Date;
}

interface ToolExecutionItemProps {
  toolCall: ToolCall;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

function ToolExecutionItem({
  toolCall,
  isExpanded = false,
  onToggleExpanded,
}: ToolExecutionItemProps) {
  const getStatusIcon = () => {
    switch (toolCall.status) {
      case "starting":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "executing":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Settings className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatArguments = (args: Record<string, any>) => {
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return String(args);
    }
  };

  const formatResult = (result: any) => {
    if (typeof result === "string") return result;
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  };

  return (
    <div className="border rounded-lg bg-card">
      <Collapsible open={isExpanded} onOpenChange={onToggleExpanded}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full h-auto p-3 justify-start hover:bg-muted/50"
          >
            <div className="flex items-center gap-3 w-full">
              {getStatusIcon()}

              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{toolCall.name}</span>
                </div>
                {toolCall.error && (
                  <p className="text-xs text-red-600 truncate">
                    Error: {toolCall.error}
                  </p>
                )}
              </div>
            </div>
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="px-3 pb-3">
          <div className="space-y-3">
            {/* Arguments */}
            {toolCall.arguments &&
              Object.keys(toolCall.arguments).length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">
                    Arguments:
                  </h4>
                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">
                    {formatArguments(toolCall.arguments)}
                  </pre>
                </div>
              )}

            {/* Result */}
            {toolCall.result && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">
                  Result:
                </h4>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {formatResult(toolCall.result)}
                </pre>
              </div>
            )}

            {/* Error details */}
            {toolCall.error && (
              <div>
                <h4 className="text-xs font-medium text-red-600 mb-2">
                  Error Details:
                </h4>
                <pre className="text-xs bg-red-50 text-red-800 p-2 rounded border border-red-200">
                  {toolCall.error}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

interface ToolExecutionTrackerProps {
  toolCalls: ToolCall[];
  className?: string;
}

export function ToolExecutionTracker({
  toolCalls,
  className = "",
}: ToolExecutionTrackerProps) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [isMainSectionExpanded, setIsMainSectionExpanded] = useState(false);

  const toggleExpanded = useCallback((toolId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  }, []);

  // Calculate overall progress
  const totalTools = toolCalls.length;
  const completedTools = toolCalls.filter(
    (t) => t.status === "completed" || t.status === "error",
  ).length;
  const progressPercentage =
    totalTools > 0 ? (completedTools / totalTools) * 100 : 0;

  const hasActiveTools = toolCalls.some(
    (t) => t.status === "starting" || t.status === "executing",
  );

  const hasErrors = toolCalls.some((t) => t.status === "error");

  if (toolCalls.length === 0) {
    return null;
  }

  return (
    <div className={`${className}`}>
      <Collapsible
        open={isMainSectionExpanded}
        onOpenChange={setIsMainSectionExpanded}
      >
        {/* Collapsible header */}
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full h-auto p-3 justify-start hover:bg-muted/50 bg-muted/30 rounded-lg"
          >
            <div className="flex items-center gap-3 w-full">
              <Settings
                className={`h-4 w-4 ${hasActiveTools ? "text-blue-500" : "text-muted-foreground"}`}
              />
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Tool Execution</span>
                  <Badge
                    variant={
                      hasErrors
                        ? "destructive"
                        : hasActiveTools
                          ? "default"
                          : "secondary"
                    }
                  >
                    {completedTools}/{totalTools}
                  </Badge>
                </div>
              </div>
              {isMainSectionExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </Button>
        </CollapsibleTrigger>

        {/* Individual tool calls inside collapsible content */}
        <CollapsibleContent className="pt-2">
          <div className="space-y-2">
            {toolCalls.map((toolCall) => (
              <ToolExecutionItem
                key={toolCall.id}
                toolCall={toolCall}
                isExpanded={expandedTools.has(toolCall.id)}
                onToggleExpanded={() => toggleExpanded(toolCall.id)}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Hook for managing streaming tool execution state
export function useToolExecutionTracker() {
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);

  const addOrUpdateTool = useCallback(
    (
      name: string,
      status: ToolStatus,
      args?: Record<string, any>,
      result?: any,
      error?: string,
    ) => {
      const toolId = `${name}-${Date.now()}`;

      setToolCalls((prev) => {
        // Find existing tool call or create new one
        const existingIndex = prev.findIndex(
          (t) =>
            t.name === name && t.status !== "completed" && t.status !== "error",
        );

        if (existingIndex >= 0) {
          // Update existing tool call
          const updated = [...prev];
          const existing = updated[existingIndex];
          updated[existingIndex] = {
            ...existing,
            status,
            ...(args && { arguments: args }),
            ...(result && { result }),
            ...(error && { error }),
            ...(status === "completed" || status === "error"
              ? { endTime: new Date() }
              : {}),
          };
          return updated;
        } else {
          // Add new tool call
          const newTool: ToolCall = {
            id: toolId,
            name,
            status,
            arguments: args,
            result,
            error,
            startTime: new Date(),
            ...(status === "completed" || status === "error"
              ? { endTime: new Date() }
              : {}),
          };
          return [...prev, newTool];
        }
      });

      return toolId;
    },
    [],
  );

  const clearTools = useCallback(() => {
    setToolCalls([]);
  }, []);

  return {
    toolCalls,
    addOrUpdateTool,
    clearTools,
  };
}
