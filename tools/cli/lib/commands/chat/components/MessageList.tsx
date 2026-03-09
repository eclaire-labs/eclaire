import { Box, Text } from "ink";
import { Markdown } from "./Markdown.js";
import { ToolCallDisplay } from "./ToolCallDisplay.js";
import { ThinkingBlock } from "./ThinkingBlock.js";
import type { DisplayMessage, DisplayOptions } from "../types.js";

interface MessageListProps {
  messages: DisplayMessage[];
  options: DisplayOptions;
}

export function MessageList({ messages, options }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <Box marginY={1}>
        <Text dimColor>
          Start a conversation. Type your message and press Enter.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {messages.map((msg, i) => {
        const isFirst = i === 0;
        const prevMsg = i > 0 ? messages[i - 1] : null;
        const showSeparator =
          !isFirst && msg.role !== "tool" && prevMsg?.role !== "tool";

        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: messages have no natural ID
          <Box key={`msg-${i}`} flexDirection="column">
            {showSeparator && <Box marginTop={1} />}
            {msg.role === "tool" ? (
              msg.toolCall ? (
                <ToolCallDisplay toolCall={msg.toolCall} options={options} />
              ) : (
                <Text dimColor>{msg.content}</Text>
              )
            ) : msg.role === "user" ? (
              <Box width="100%" paddingX={2} paddingY={1} backgroundColor="#333333">
                <Text wrap="wrap">{msg.content}</Text>
              </Box>
            ) : (
              <Box flexDirection="column">
                {msg.thinking && (
                  <ThinkingBlock content={msg.thinking} options={options} />
                )}
                <Markdown content={msg.content} />
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
