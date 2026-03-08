import React from "react";
import { Box, Text } from "ink";
import { Spinner } from "./Spinner.js";
import type { ToolCallInfo, DisplayOptions } from "../types.js";

interface ToolCallDisplayProps {
  toolCall: ToolCallInfo;
  options: DisplayOptions;
}

function formatArgs(args?: Record<string, unknown>): string {
  if (!args) return "";
  const keys = Object.keys(args);
  if (keys.length === 0) return "";
  return `(${keys.join(", ")})`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

export function ToolCallDisplay({ toolCall, options }: ToolCallDisplayProps) {
  const { name, status, arguments: args, result, error } = toolCall;

  if (status === "starting" || status === "executing") {
    const label = options.showTools
      ? `${name}${formatArgs(args)}`
      : name;
    return <Spinner label={label} color="yellow" />;
  }

  if (status === "completed") {
    const showResult = options.showTools && result;
    return (
      <Box flexDirection="column">
        <Text>
          <Text color="green">✓ </Text>
          <Text dimColor>{name}</Text>
          {showResult && (
            <Text dimColor>
              {" → "}
              {options.verbose ? result : truncate(result, 80)}
            </Text>
          )}
        </Text>
      </Box>
    );
  }

  if (status === "error") {
    return (
      <Text>
        <Text color="red">✗ </Text>
        <Text dimColor>{name}</Text>
        {error && (
          <Text color="red" dimColor>
            {": "}
            {options.verbose ? error : truncate(error, 80)}
          </Text>
        )}
      </Text>
    );
  }

  return null;
}
