import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  modelName: string;
  messageCount: number;
}

export function StatusBar({ modelName, messageCount }: StatusBarProps) {
  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
    >
      <Text color="cyan" bold>
        Eclaire Chat
      </Text>
      <Text color="gray">
        Model: <Text color="white">{modelName}</Text>
        {"  "}
        Messages: <Text color="white">{messageCount}</Text>
        {"  "}
        <Text color="gray" dimColor>Ctrl+C to exit</Text>
      </Text>
    </Box>
  );
}
