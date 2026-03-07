import React from "react";
import { Box, Text } from "ink";

interface StreamingMessageProps {
  content: string;
  label?: string;
  color?: string;
}

export function StreamingMessage({
  content,
  label = "Assistant",
  color = "green",
}: StreamingMessageProps) {
  return (
    <Box flexDirection="column" marginY={0}>
      <Text bold color={color}>
        {label}
      </Text>
      <Text wrap="wrap">{content}</Text>
      <Text color="yellow">▋</Text>
    </Box>
  );
}
