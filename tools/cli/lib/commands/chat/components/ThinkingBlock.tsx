import React from "react";
import { Box, Text } from "ink";
import { Spinner } from "./Spinner.js";
import type { DisplayOptions } from "../types.js";

interface ThinkingBlockProps {
  content: string;
  streaming?: boolean;
  options: DisplayOptions;
}

function lastNLines(text: string, n: number): string {
  const lines = text.split("\n");
  if (lines.length <= n) return text;
  return `…\n${lines.slice(-n).join("\n")}`;
}

function countLines(text: string): number {
  return text.split("\n").length;
}

export function ThinkingBlock({
  content,
  streaming,
  options,
}: ThinkingBlockProps) {
  if (!content) return null;

  // Streaming mode: show spinner + last few lines
  if (streaming) {
    return (
      <Box flexDirection="column" marginY={0}>
        <Spinner label="Thinking..." color="gray" />
        <Box flexDirection="column" marginLeft={2}>
          <Text dimColor italic wrap="wrap">
            {options.verbose ? content : lastNLines(content, 3)}
          </Text>
        </Box>
      </Box>
    );
  }

  // Completed mode
  if (!options.showThinking) return null;

  // Show full thinking content
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor italic wrap="wrap">
        {content}
      </Text>
    </Box>
  );
}
