import React from "react";
import { Box, Text } from "ink";

export function StreamingMessage({ content }: { content: string }) {
  return (
    <Box flexDirection="column" marginY={0}>
      <Text bold color="green">
        Assistant
      </Text>
      <Text wrap="wrap">{content}</Text>
      <Text color="yellow">▋</Text>
    </Box>
  );
}
