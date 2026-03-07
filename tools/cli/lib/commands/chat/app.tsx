import React, { useState, useCallback } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import {
  callAI,
  callAIStream,
  getActiveModelForContext,
  LLMStreamParser,
} from "@eclaire/ai";
import type { AIMessage, AIContext } from "@eclaire/ai";
import { ChatInput } from "./components/ChatInput.js";
import { MessageList } from "./components/MessageList.js";
import { StatusBar } from "./components/StatusBar.js";
import { StreamingMessage } from "./components/StreamingMessage.js";

interface ChatOptions {
  model?: string;
  context: string;
  stream: boolean;
}

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
}

function ChatApp({ options }: { options: ChatOptions }) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Get model info
  const context = (options.context || "backend") as AIContext;
  const model = getActiveModelForContext(context);
  const modelName = options.model || model?.name || "Unknown model";

  useInput((_input, key) => {
    if (key.ctrl && _input === "c") {
      exit();
    }
  });

  const handleSubmit = useCallback(
    async (input: string) => {
      if (!input.trim() || isStreaming) return;

      const userMessage: DisplayMessage = { role: "user", content: input };
      setMessages((prev) => [...prev, userMessage]);
      setError(null);

      const newAiMessages: AIMessage[] = [
        ...aiMessages,
        { role: "user" as const, content: input },
      ];
      setAiMessages(newAiMessages);

      if (options.stream) {
        setIsStreaming(true);
        setCurrentResponse("");

        try {
          const { stream } = await callAIStream(newAiMessages, context, {
            maxTokens: 4096,
          });

          const parser = new LLMStreamParser();
          const parsedStream = await parser.processSSEStream(stream);
          const reader = parsedStream.getReader();
          let fullResponse = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            if (value.type === "content" && value.content) {
              fullResponse += value.content;
              setCurrentResponse(fullResponse);
            }
          }

          const assistantMessage: DisplayMessage = {
            role: "assistant",
            content: fullResponse,
          };
          setMessages((prev) => [...prev, assistantMessage]);
          setAiMessages((prev) => [
            ...prev,
            { role: "assistant" as const, content: fullResponse },
          ]);
          setCurrentResponse("");
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to get response",
          );
        } finally {
          setIsStreaming(false);
        }
      } else {
        // Non-streaming mode
        setIsStreaming(true);
        try {
          const response = await callAI(newAiMessages, context, {
            maxTokens: 4096,
          });

          const content = response.content || "";
          const assistantMessage: DisplayMessage = {
            role: "assistant",
            content,
          };
          setMessages((prev) => [...prev, assistantMessage]);
          setAiMessages((prev) => [
            ...prev,
            { role: "assistant" as const, content },
          ]);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to get response",
          );
        } finally {
          setIsStreaming(false);
        }
      }
    },
    [aiMessages, context, isStreaming, options.stream],
  );

  return (
    <Box flexDirection="column" width="100%">
      <StatusBar modelName={modelName} messageCount={messages.length} />

      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        <MessageList messages={messages} />

        {isStreaming && currentResponse && (
          <StreamingMessage content={currentResponse} />
        )}

        {isStreaming && !currentResponse && (
          <Box marginY={0}>
            <Text color="yellow">Thinking...</Text>
          </Box>
        )}

        {error && (
          <Box marginY={0}>
            <Text color="red">Error: {error}</Text>
          </Box>
        )}
      </Box>

      <ChatInput onSubmit={handleSubmit} isDisabled={isStreaming} />
    </Box>
  );
}

export async function startChat(options: ChatOptions): Promise<void> {
  const instance = render(<ChatApp options={options} />);
  await instance.waitUntilExit();
}
