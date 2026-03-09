import { Box, Text } from "ink";
import { Markdown } from "./Markdown.js";
import { ThinkingBlock } from "./ThinkingBlock.js";
import type { DisplayOptions } from "../types.js";

interface StreamingMessageProps {
  content: string;
  label?: string;
  color?: string;
  isThinking?: boolean;
  options: DisplayOptions;
}

export function StreamingMessage({
  content,
  isThinking,
  options,
}: StreamingMessageProps) {
  if (isThinking) {
    return <ThinkingBlock content={content} streaming options={options} />;
  }

  return (
    <Box flexDirection="column" marginY={0}>
      <Markdown content={content} />
      <Text dimColor>▋</Text>
    </Box>
  );
}
