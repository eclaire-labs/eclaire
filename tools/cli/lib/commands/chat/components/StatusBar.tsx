import React from "react";
import { Box, Text } from "ink";
import type { DisplayOptions } from "../types.js";

interface StatusBarProps {
  modelName: string;
  messageCount: number;
  displayOptions?: DisplayOptions;
  enableThinking?: boolean;
}

export function StatusBar({
  modelName,
  messageCount,
  displayOptions,
  enableThinking,
}: StatusBarProps) {
  const indicators: string[] = [];
  if (displayOptions) {
    if (enableThinking) indicators.push("think");
    if (displayOptions.showThinking) indicators.push("show-think");
    if (displayOptions.showTools) indicators.push("tools");
    if (displayOptions.verbose) indicators.push("verbose");
  }

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
    >
      <Text bold>Eclaire Chat</Text>
      <Text dimColor>
        {modelName}
        {"  "}
        {messageCount} msgs
        {indicators.length > 0 && `  [${indicators.join(" ")}]`}
        {"  "}
        Ctrl+C to exit
      </Text>
    </Box>
  );
}
