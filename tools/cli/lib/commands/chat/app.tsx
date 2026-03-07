import React, { useState, useCallback, useEffect } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import { backendFetch, getModelInfo } from "../../backend-client.js";
import { ChatInput } from "./components/ChatInput.js";
import { MessageList } from "./components/MessageList.js";
import { StatusBar } from "./components/StatusBar.js";
import { StreamingMessage } from "./components/StreamingMessage.js";

interface ChatOptions {
  stream: boolean;
  conversation?: string;
}

interface DisplayMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}

function ChatApp({ options }: { options: ChatOptions }) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentThinking, setCurrentThinking] = useState("");
  const [currentResponse, setCurrentResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(
    options.conversation,
  );
  const [modelName, setModelName] = useState("Loading...");

  useEffect(() => {
    getModelInfo()
      .then((info) => setModelName(info.modelShortName || info.modelFullName))
      .catch(() => setModelName("Unknown model"));
  }, []);

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
      setIsStreaming(true);

      const body = {
        prompt: input,
        conversationId,
        stream: options.stream,
        enableThinking: true,
      };

      if (options.stream) {
        setCurrentResponse("");
        setCurrentThinking("");

        try {
          const response = await backendFetch("/api/prompt/stream", {
            method: "POST",
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `API error: ${response.status} ${response.statusText} - ${errorText}`,
            );
          }

          if (!response.body) {
            throw new Error("No response body available for streaming");
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullResponse = "";
          let fullThinking = "";
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (!data || data === "[DONE]") continue;

              try {
                const event = JSON.parse(data);

                switch (event.type) {
                  case "text-chunk":
                    if (!fullResponse) {
                      setCurrentThinking("");
                    }
                    fullResponse += event.content;
                    setCurrentResponse(fullResponse);
                    break;
                  case "thought":
                    fullThinking += event.content;
                    setCurrentThinking(fullThinking);
                    break;
                  case "tool-call":
                    if (
                      event.status === "starting" ||
                      event.status === "executing"
                    ) {
                      setMessages((prev) => [
                        ...prev,
                        {
                          role: "tool",
                          content: `🔧 ${event.name}...`,
                        },
                      ]);
                    }
                    break;
                  case "done":
                    if (event.conversationId) {
                      setConversationId(event.conversationId);
                    }
                    break;
                  case "error":
                    setError(event.error || event.message || "Stream error");
                    break;
                }
              } catch {
                // Skip malformed JSON lines
              }
            }
          }

          if (fullResponse) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: fullResponse },
            ]);
            setCurrentResponse("");
          }
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to get response",
          );
        } finally {
          setIsStreaming(false);
        }
      } else {
        // Non-streaming mode
        try {
          const response = await backendFetch("/api/prompt", {
            method: "POST",
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `API error: ${response.status} ${response.statusText} - ${errorText}`,
            );
          }

          const data = await response.json();
          const content = data.response || "";

          if (data.conversationId) {
            setConversationId(data.conversationId);
          }

          if (data.toolCalls?.length) {
            for (const tc of data.toolCalls) {
              setMessages((prev) => [
                ...prev,
                { role: "tool", content: `🔧 ${tc.name}` },
              ]);
            }
          }

          setMessages((prev) => [
            ...prev,
            { role: "assistant", content },
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
    [conversationId, isStreaming, options.stream],
  );

  return (
    <Box flexDirection="column" width="100%">
      <StatusBar modelName={modelName} messageCount={messages.length} />

      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        <MessageList messages={messages} />

        {isStreaming && currentThinking && !currentResponse && (
          <StreamingMessage
            content={currentThinking}
            label="Thinking"
            color="yellow"
          />
        )}

        {isStreaming && currentResponse && (
          <StreamingMessage content={currentResponse} />
        )}

        {isStreaming && !currentResponse && !currentThinking && (
          <Box marginY={0}>
            <Text color="yellow">Waiting...</Text>
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
