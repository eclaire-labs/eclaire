/**
 * Agent Activity View
 *
 * Progressive-disclosure component that shows what an agent did during a turn.
 * - Collapsed: summary badge (step count, tool count, duration)
 * - Expanded: compact step timeline with tool names and status icons
 * - Drill-down: full tool I/O on click
 */

import {
  AlertCircle,
  Brain,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Settings,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAgentSteps } from "@/hooks/use-agent-steps";
import type { AgentExecutionSummary, AgentStep } from "@/types/message";
import type { ToolCall } from "./tool-execution-tracker";

// =============================================================================
// Summary badge (Level 1)
// =============================================================================

interface ActivitySummaryProps {
  /** From message metadata (already loaded) */
  executionSummary?: AgentExecutionSummary;
  /** Fallback: count from flat toolCalls array */
  toolCallCount: number;
  isExpanded: boolean;
  hasActiveTools: boolean;
}

function ActivitySummaryBadge({
  executionSummary,
  toolCallCount,
  isExpanded,
  hasActiveTools,
}: ActivitySummaryProps) {
  const stepCount = executionSummary?.stepCount;
  const totalTools = executionSummary?.totalToolCalls ?? toolCallCount;
  const durationMs = executionSummary?.totalDurationMs;

  const parts: string[] = [];
  if (stepCount) parts.push(`${stepCount} step${stepCount > 1 ? "s" : ""}`);
  parts.push(`${totalTools} tool${totalTools !== 1 ? "s" : ""}`);
  if (durationMs) {
    parts.push(
      durationMs >= 1000
        ? `${(durationMs / 1000).toFixed(1)}s`
        : `${durationMs}ms`,
    );
  }

  return (
    <div className="flex items-center gap-3 w-full">
      <Settings
        className={`h-4 w-4 shrink-0 ${hasActiveTools ? "text-blue-500" : "text-muted-foreground"}`}
      />
      <div className="flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Agent Activity</span>
          <Badge variant="secondary" className="text-xs font-normal">
            {parts.join(" \u00b7 ")}
          </Badge>
        </div>
      </div>
      {isExpanded ? (
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
    </div>
  );
}

// =============================================================================
// Step timeline (Level 2)
// =============================================================================

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function formatTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

interface StepToolItemProps {
  exec: NonNullable<AgentStep["toolExecutions"]>[number];
  isExpanded: boolean;
  onToggle: () => void;
}

function StepToolItem({ exec, isExpanded, onToggle }: StepToolItemProps) {
  const isError = exec.result?.isError === true;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 w-full text-left py-0.5 px-1 rounded hover:bg-muted/50 text-xs"
        >
          {isError ? (
            <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />
          ) : (
            <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
          )}
          <span className="font-mono truncate">{exec.toolName}</span>
          <span className="text-muted-foreground ml-auto shrink-0">
            {formatDuration(exec.durationMs)}
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="pl-5 pb-1">
        <div className="space-y-1.5 text-xs">
          {/* Arguments */}
          {exec.input &&
            Object.keys(exec.input).length > 0 &&
            !("_truncated" in exec.input) && (
              <div>
                <span className="text-muted-foreground text-[10px] uppercase tracking-wider">
                  Input
                </span>
                <pre className="bg-muted p-1.5 rounded overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto text-[11px] mt-0.5">
                  {JSON.stringify(exec.input, null, 2)}
                </pre>
              </div>
            )}

          {/* Result */}
          {exec.result && !exec.result._truncated && exec.result.content && (
            <div>
              <span className="text-muted-foreground text-[10px] uppercase tracking-wider">
                Result
              </span>
              <pre className="bg-muted p-1.5 rounded overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto text-[11px] mt-0.5">
                {exec.result.content
                  .map((c) => c.text || "[non-text content]")
                  .join("\n")}
              </pre>
            </div>
          )}

          {/* Truncated result */}
          {exec.result?._truncated && (
            <div className="text-muted-foreground italic">
              Result truncated ({exec.result._originalSize})
            </div>
          )}

          {/* Error */}
          {isError && exec.result?.content?.[0]?.text && (
            <div>
              <span className="text-destructive text-[10px] uppercase tracking-wider">
                Error
              </span>
              <pre className="bg-destructive/10 text-destructive p-1.5 rounded text-[11px] mt-0.5">
                {exec.result.content[0].text}
              </pre>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface StepTimelineProps {
  steps: AgentStep[];
}

function StepTimeline({ steps }: StepTimelineProps) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [expandedThinking, setExpandedThinking] = useState<Set<number>>(
    new Set(),
  );

  const toggleTool = useCallback((id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleThinking = useCallback((stepNum: number) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(stepNum)) next.delete(stepNum);
      else next.add(stepNum);
      return next;
    });
  }, []);

  return (
    <div className="space-y-2">
      {steps.map((step) => (
        <div key={step.id} className="flex gap-2">
          {/* Step number gutter */}
          <div className="flex flex-col items-center">
            <div className="text-[10px] text-muted-foreground font-mono w-5 text-right shrink-0">
              {step.stepNumber}
            </div>
            {!step.isTerminal && <div className="w-px flex-1 bg-border mt-1" />}
          </div>

          {/* Step content */}
          <div className="flex-1 min-w-0 pb-1">
            <div className="text-[10px] text-muted-foreground mb-0.5">
              {formatTime(step.timestamp)}
            </div>

            {/* Thinking */}
            {step.thinkingContent && (
              <Collapsible
                open={expandedThinking.has(step.stepNumber)}
                onOpenChange={() => toggleThinking(step.stepNumber)}
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground py-0.5"
                  >
                    <Brain className="h-3 w-3" />
                    <span>Thinking</span>
                    {expandedThinking.has(step.stepNumber) ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="p-1.5 bg-muted/20 rounded border-l-2 border-muted-foreground/20 mb-1">
                    <div className="text-[11px] whitespace-pre-wrap text-muted-foreground/90 leading-relaxed font-mono max-h-32 overflow-y-auto">
                      {step.thinkingContent}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Tool executions */}
            {step.toolExecutions?.map((exec, idx) => (
                <StepToolItem
                  key={exec.toolCallId || `${step.stepNumber}-${idx}`}
                  exec={exec}
                  isExpanded={expandedTools.has(
                    exec.toolCallId || `${step.stepNumber}-${idx}`,
                  )}
                  onToggle={() =>
                    toggleTool(exec.toolCallId || `${step.stepNumber}-${idx}`)
                  }
                />
              ))}

            {/* Terminal step */}
            {step.isTerminal && (
              <div className="text-[11px] text-muted-foreground italic mt-0.5">
                Done
                {step.stopReason === "max_steps" && " (max steps reached)"}
                {step.stopReason === "aborted" && " (aborted)"}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Fallback: flat tool list (when no steps are available)
// =============================================================================

interface FlatToolListProps {
  toolCalls: ToolCall[];
}

function FlatToolList({ toolCalls }: FlatToolListProps) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  return (
    <div className="space-y-1">
      {toolCalls.map((tc) => {
        const isExpanded = expandedTools.has(tc.id);
        const isError = tc.status === "error";
        const isActive = tc.status === "starting" || tc.status === "executing";

        return (
          <Collapsible
            key={tc.id}
            open={isExpanded}
            onOpenChange={() => {
              setExpandedTools((prev) => {
                const next = new Set(prev);
                if (next.has(tc.id)) next.delete(tc.id);
                else next.add(tc.id);
                return next;
              });
            }}
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left py-0.5 px-1 rounded hover:bg-muted/50 text-xs"
              >
                {isActive ? (
                  <Loader2 className="h-3 w-3 text-blue-500 animate-spin shrink-0" />
                ) : isError ? (
                  <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />
                ) : (
                  <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                )}
                <span className="font-mono truncate">{tc.name}</span>
                {tc.error && (
                  <span className="text-destructive truncate text-[11px]">
                    {tc.error}
                  </span>
                )}
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent className="pl-5 pb-1 text-xs">
              {tc.arguments && Object.keys(tc.arguments).length > 0 && (
                <pre className="bg-muted p-1.5 rounded overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto text-[11px]">
                  {JSON.stringify(tc.arguments, null, 2)}
                </pre>
              )}
              {tc.result != null && (
                <pre className="bg-muted p-1.5 rounded overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto text-[11px] mt-1">
                  {String(
                    typeof tc.result === "string"
                      ? tc.result
                      : JSON.stringify(tc.result, null, 2),
                  )}
                </pre>
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

// =============================================================================
// Main component
// =============================================================================

interface AgentActivityViewProps {
  /** Session/conversation ID for lazy-loading steps */
  sessionId?: string;
  /** Message ID for lazy-loading steps */
  messageId?: string;
  /** Execution summary from message metadata */
  executionSummary?: AgentExecutionSummary;
  /** Flat tool calls (for streaming mode or fallback) */
  toolCalls: ToolCall[];
  /** Whether tools are currently executing (streaming mode) */
  isStreaming?: boolean;
  className?: string;
}

export function AgentActivityView({
  sessionId,
  messageId,
  executionSummary,
  toolCalls,
  isStreaming = false,
  className = "",
}: AgentActivityViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Lazy-load step detail only when expanded and not streaming
  const { data: steps, isLoading: stepsLoading } = useAgentSteps(
    sessionId,
    messageId,
    isExpanded && !isStreaming,
  );

  const hasActiveTools = toolCalls.some(
    (t) => t.status === "starting" || t.status === "executing",
  );
  if (toolCalls.length === 0 && !executionSummary) {
    return null;
  }

  const hasSteps = steps && steps.length > 0;

  return (
    <div className={className}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full h-auto p-3 justify-start hover:bg-muted/50 bg-muted/30 rounded-lg"
          >
            <ActivitySummaryBadge
              executionSummary={executionSummary}
              toolCallCount={toolCalls.length}
              isExpanded={isExpanded}
              hasActiveTools={hasActiveTools}
            />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-2 px-1">
          {/* Loading state */}
          {stepsLoading && !isStreaming && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading execution trace...
            </div>
          )}

          {/* Rich step timeline (when steps are loaded) */}
          {hasSteps && !isStreaming && <StepTimeline steps={steps} />}

          {/* Flat tool list (streaming mode or no steps available) */}
          {(!hasSteps || isStreaming) && !stepsLoading && (
            <FlatToolList toolCalls={toolCalls} />
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
