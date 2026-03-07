import React from "react";
import { Box, Text } from "ink";

interface DisplayMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}

export function MessageList({ messages }: { messages: DisplayMessage[] }) {
  if (messages.length === 0) {
    return (
      <Box marginY={1}>
        <Text color="gray">
          Start a conversation. Type your message and press Enter.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {messages.map((msg, i) => (
        <Box key={i} marginY={0} flexDirection="column">
          {msg.role === "tool" ? (
            <Text color="yellow" dimColor>{msg.content}</Text>
          ) : (
            <>
              <Text bold color={msg.role === "user" ? "blue" : "green"}>
                {msg.role === "user" ? "You" : "Assistant"}
              </Text>
              <Text wrap="wrap">{msg.content}</Text>
            </>
          )}
          {i < messages.length - 1 && msg.role !== "tool" && <Text color="gray">{"─".repeat(40)}</Text>}
        </Box>
      ))}
    </Box>
  );
}
