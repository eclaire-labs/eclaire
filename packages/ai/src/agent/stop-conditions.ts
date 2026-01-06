/**
 * Stop Conditions
 *
 * Composable stop conditions for controlling the agent loop.
 * Inspired by AI SDK v6 patterns.
 */

import type { AgentStep, StopCondition } from "./types.js";

/**
 * Stop after N steps.
 *
 * @example
 * ```typescript
 * const agent = new ToolLoopAgent({
 *   stopWhen: stepCountIs(10),
 * });
 * ```
 */
export function stepCountIs(maxSteps: number): StopCondition {
  return (steps: AgentStep[]): boolean => {
    return steps.length >= maxSteps;
  };
}

/**
 * Stop when a specific tool has been called.
 *
 * @example
 * ```typescript
 * const agent = new ToolLoopAgent({
 *   stopWhen: hasToolCall("finalAnswer"),
 * });
 * ```
 */
export function hasToolCall(toolName: string): StopCondition {
  return (steps: AgentStep[]): boolean => {
    return steps.some((step) =>
      step.toolResults?.some((tr) => tr.toolName === toolName),
    );
  };
}

/**
 * Stop when the model returns without any tool calls.
 * This is the natural end of an agentic conversation.
 *
 * @example
 * ```typescript
 * const agent = new ToolLoopAgent({
 *   stopWhen: noToolCalls(),
 * });
 * ```
 */
export function noToolCalls(): StopCondition {
  return (steps: AgentStep[]): boolean => {
    if (steps.length === 0) return false;
    const lastStep = steps[steps.length - 1]!;
    return (
      !lastStep.aiResponse.toolCalls ||
      lastStep.aiResponse.toolCalls.length === 0
    );
  };
}

/**
 * Stop when the finish reason is "stop" (model completed naturally).
 */
export function finishReasonStop(): StopCondition {
  return (steps: AgentStep[]): boolean => {
    if (steps.length === 0) return false;
    const lastStep = steps[steps.length - 1]!;
    return lastStep.aiResponse.finishReason === "stop";
  };
}

/**
 * Stop when any of the provided conditions match.
 *
 * @example
 * ```typescript
 * const agent = new ToolLoopAgent({
 *   stopWhen: anyOf(
 *     stepCountIs(10),
 *     hasToolCall("finalAnswer"),
 *     noToolCalls()
 *   ),
 * });
 * ```
 */
export function anyOf(...conditions: StopCondition[]): StopCondition {
  return (steps: AgentStep[]): boolean => {
    return conditions.some((condition) => condition(steps));
  };
}

/**
 * Stop when all of the provided conditions match.
 *
 * @example
 * ```typescript
 * const agent = new ToolLoopAgent({
 *   stopWhen: allOf(
 *     stepCountIs(5),
 *     hasToolCall("searchComplete")
 *   ),
 * });
 * ```
 */
export function allOf(...conditions: StopCondition[]): StopCondition {
  return (steps: AgentStep[]): boolean => {
    return conditions.every((condition) => condition(steps));
  };
}

/**
 * Create a custom stop condition with access to full step history.
 *
 * @example
 * ```typescript
 * const agent = new ToolLoopAgent({
 *   stopWhen: custom((steps) => {
 *     // Stop if we've used more than 10000 tokens
 *     const totalTokens = steps.reduce(
 *       (sum, s) => sum + (s.aiResponse.usage?.total_tokens ?? 0),
 *       0
 *     );
 *     return totalTokens > 10000;
 *   }),
 * });
 * ```
 */
export function custom(fn: (steps: AgentStep[]) => boolean): StopCondition {
  return fn;
}

/**
 * Stop when total tokens exceed a threshold.
 */
export function maxTokens(threshold: number): StopCondition {
  return (steps: AgentStep[]): boolean => {
    const totalTokens = steps.reduce(
      (sum, step) => sum + (step.aiResponse.usage?.total_tokens ?? 0),
      0,
    );
    return totalTokens >= threshold;
  };
}

/**
 * Stop when execution time exceeds a threshold (in milliseconds).
 * Requires steps to have accurate timestamps.
 */
export function maxDuration(thresholdMs: number): StopCondition {
  return (steps: AgentStep[]): boolean => {
    if (steps.length === 0) return false;
    const firstStep = steps[0]!;
    const lastStep = steps[steps.length - 1]!;
    const startTime = new Date(firstStep.timestamp).getTime();
    const endTime = new Date(lastStep.timestamp).getTime();
    return endTime - startTime >= thresholdMs;
  };
}

/**
 * Evaluate stop conditions and return the reason if stopped.
 */
export function evaluateStopConditions(
  steps: AgentStep[],
  conditions: StopCondition | StopCondition[],
): { shouldStop: boolean; reason?: AgentStep["stopReason"] } {
  const conditionArray = Array.isArray(conditions) ? conditions : [conditions];

  for (const condition of conditionArray) {
    if (condition(steps)) {
      // Determine the reason based on the last step
      const lastStep = steps[steps.length - 1];
      let reason: AgentStep["stopReason"] = "stop_condition";

      if (lastStep) {
        if (
          !lastStep.aiResponse.toolCalls ||
          lastStep.aiResponse.toolCalls.length === 0
        ) {
          reason = "no_tool_calls";
        } else if (lastStep.aiResponse.finishReason === "stop") {
          reason = "finish_reason";
        }
      }

      return { shouldStop: true, reason };
    }
  }

  return { shouldStop: false };
}

/**
 * Default stop conditions: stop after 10 steps or when no tool calls.
 */
export const defaultStopConditions = anyOf(stepCountIs(10), noToolCalls());
