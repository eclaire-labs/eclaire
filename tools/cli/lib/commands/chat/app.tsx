import React, { useState, useCallback, useEffect, useRef } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import {
  getModelInfo,
  createSession,
  getSession as getSessionApi,
  listSessions,
  sendMessage,
  abortSession,
} from "../../backend-client.js";
import { ChatInput } from "./components/ChatInput.js";
import { MessageList } from "./components/MessageList.js";
import { StatusBar } from "./components/StatusBar.js";
import { StreamingMessage } from "./components/StreamingMessage.js";
import { Spinner } from "./components/Spinner.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import type { DisplayMessage, DisplayOptions } from "./types.js";

interface ChatOptions {
  stream: boolean;
  conversation?: string;
  thinking: boolean;
  tools: boolean;
  verbose: boolean;
}

// ============================================================================
// Slash Commands
// ============================================================================

interface CommandContext {
  setMessages: React.Dispatch<React.SetStateAction<DisplayMessage[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSessionId: React.Dispatch<React.SetStateAction<string | undefined>>;
  sessionIdRef: React.MutableRefObject<string | undefined>;
  setSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  modelName: string;
  exit: () => void;
}

interface SlashCommand {
  name: string;
  description: string;
  handler: (args: string, ctx: CommandContext) => void | Promise<void>;
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "help",
    description: "Show available commands",
    handler: (_args, ctx) => {
      const helpText = SLASH_COMMANDS.map(
        (cmd) => `/${cmd.name} — ${cmd.description}`,
      ).join("\n");
      ctx.setMessages((prev) => [
        ...prev,
        { role: "assistant", content: helpText },
      ]);
    },
  },
  {
    name: "clear",
    description: "Clear message history",
    handler: (_args, ctx) => {
      ctx.setMessages([]);
      ctx.setError(null);
    },
  },
  {
    name: "new",
    description: "Start a new session",
    handler: async (_args, ctx) => {
      try {
        const session = await createSession();
        ctx.setSessionId(session.id);
        ctx.sessionIdRef.current = session.id;
        ctx.setMessages([]);
        ctx.setError(null);
      } catch (err) {
        ctx.setError(
          err instanceof Error ? err.message : "Failed to create session",
        );
      }
    },
  },
  {
    name: "model",
    description: "Show current model",
    handler: (_args, ctx) => {
      ctx.setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Current model: ${ctx.modelName}` },
      ]);
    },
  },
  {
    name: "history",
    description: "Show recent sessions",
    handler: async (_args, ctx) => {
      try {
        const sessions = await listSessions(10);
        if (sessions.length === 0) {
          ctx.setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "No sessions found." },
          ]);
          return;
        }
        const lines = sessions.map(
          (s) =>
            `${s.id.slice(0, 8)} — ${s.title || "(untitled)"} (${s.messageCount} msgs)`,
        );
        ctx.setMessages((prev) => [
          ...prev,
          { role: "assistant", content: lines.join("\n") },
        ]);
      } catch (err) {
        ctx.setError(
          err instanceof Error ? err.message : "Failed to list sessions",
        );
      }
    },
  },
  {
    name: "settings",
    description: "Toggle display settings",
    handler: (_args, ctx) => {
      ctx.setSettingsOpen(true);
    },
  },
  {
    name: "exit",
    description: "Exit the chat",
    handler: (_args, ctx) => {
      ctx.exit();
    },
  },
];

function findCommand(input: string): { command: SlashCommand; args: string } | null {
  if (!input.startsWith("/")) return null;
  const spaceIdx = input.indexOf(" ");
  const name = spaceIdx === -1 ? input.slice(1) : input.slice(1, spaceIdx);
  const args = spaceIdx === -1 ? "" : input.slice(spaceIdx + 1).trim();
  const command = SLASH_COMMANDS.find((c) => c.name === name);
  if (!command) return null;
  return { command, args };
}

export function getCommands(): { name: string; description: string }[] {
  return SLASH_COMMANDS.map((c) => ({ name: c.name, description: c.description }));
}

function findToolMessageIndex(
  messages: DisplayMessage[],
  toolName: string,
): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (
      messages[i]?.role === "tool" &&
      messages[i]?.toolCall?.name === toolName
    ) {
      return i;
    }
  }
  return -1;
}

function updateToolMessage(
  prev: DisplayMessage[],
  toolName: string,
  update: Partial<DisplayMessage["toolCall"]> & { name: string },
): DisplayMessage[] {
  const idx = findToolMessageIndex(prev, toolName);
  if (idx === -1) {
    return [
      ...prev,
      {
        role: "tool",
        content: "",
        toolCall: {
          status: "starting",
          ...update,
        },
      },
    ];
  }
  const updated = [...prev];
  updated[idx] = {
    ...updated[idx]!,
    toolCall: {
      ...updated[idx]!.toolCall!,
      ...update,
    },
  };
  return updated;
}

function ChatApp({ options }: { options: ChatOptions }) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentThinking, setCurrentThinking] = useState("");
  const [currentResponse, setCurrentResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [modelName, setModelName] = useState("Loading...");
  const [isInitializing, setIsInitializing] = useState(true);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const [displayOptions, setDisplayOptions] = useState<DisplayOptions>({
    showThinking: options.thinking,
    showTools: options.tools,
    verbose: options.verbose,
  });
  const [enableThinking, setEnableThinking] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Initialize: fetch model info and create/load session
  useEffect(() => {
    const init = async () => {
      try {
        const [info] = await Promise.all([
          getModelInfo().catch(() => null),
          (async () => {
            if (options.conversation) {
              // Load existing session
              const session = await getSessionApi(options.conversation);
              setSessionId(session.id);
              sessionIdRef.current = session.id;

              // Load existing messages into display
              if (session.messages?.length) {
                const displayMsgs: DisplayMessage[] = session.messages.map(
                  (m) => ({
                    role: m.role as "user" | "assistant",
                    content: m.content,
                  }),
                );
                setMessages(displayMsgs);
              }
            } else {
              // Create new session
              const session = await createSession();
              setSessionId(session.id);
              sessionIdRef.current = session.id;
            }
          })(),
        ]);

        if (info) {
          setModelName(info.modelShortName || info.modelFullName);
        } else {
          setModelName("Unknown model");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to initialize session",
        );
        setModelName("Unknown model");
      } finally {
        setIsInitializing(false);
      }
    };
    init();
  }, [options.conversation]);

  useInput((_input, key) => {
    if (key.ctrl && _input === "c") {
      // Abort running execution before exiting
      if (isStreaming && sessionIdRef.current) {
        abortSession(sessionIdRef.current).catch(() => {});
      }
      exit();
    }
  });

  const handleSubmit = useCallback(
    async (input: string) => {
      if (!input.trim() || isStreaming) return;

      // Handle slash commands
      const cmd = findCommand(input);
      if (cmd) {
        const ctx: CommandContext = {
          setMessages,
          setError,
          setSessionId,
          sessionIdRef,
          setSettingsOpen,
          modelName,
          exit,
        };
        await cmd.command.handler(cmd.args, ctx);
        return;
      }

      if (!sessionIdRef.current) return;

      const currentSessionId = sessionIdRef.current;
      const userMessage: DisplayMessage = { role: "user", content: input };
      setMessages((prev) => [...prev, userMessage]);
      setError(null);
      setIsStreaming(true);
      setCurrentResponse("");
      setCurrentThinking("");

      try {
        const response = await sendMessage(currentSessionId, input, {
          enableThinking,
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
                  fullResponse += event.content;
                  setCurrentResponse(fullResponse);
                  break;
                case "thought":
                  fullThinking += event.content;
                  setCurrentThinking(fullThinking);
                  break;
                case "tool-call":
                  if (event.status === "starting") {
                    if (event.arguments) {
                      // Second "starting" event (tool_call_end) — has arguments
                      setMessages((prev) =>
                        updateToolMessage(prev, event.name, {
                          name: event.name,
                          arguments: event.arguments,
                        }),
                      );
                    } else {
                      // First "starting" event (tool_call_start) — name only
                      setMessages((prev) =>
                        updateToolMessage(prev, event.name, {
                          name: event.name,
                          status: "starting",
                        }),
                      );
                    }
                  } else if (event.status === "executing") {
                    setMessages((prev) =>
                      updateToolMessage(prev, event.name, {
                        name: event.name,
                        status: "executing",
                      }),
                    );
                  } else if (event.status === "completed") {
                    setMessages((prev) =>
                      updateToolMessage(prev, event.name, {
                        name: event.name,
                        status: "completed",
                        result: event.result,
                      }),
                    );
                  } else if (event.status === "error") {
                    setMessages((prev) =>
                      updateToolMessage(prev, event.name, {
                        name: event.name,
                        status: "error",
                        error: event.error || "failed",
                      }),
                    );
                  }
                  break;
                case "done":
                  // Session ID is stable — no need to update from done event
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
            {
              role: "assistant",
              content: fullResponse,
              thinking: fullThinking || undefined,
            },
          ]);
          setCurrentResponse("");
          setCurrentThinking("");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to get response",
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming, modelName, exit, enableThinking],
  );

  return (
    <Box flexDirection="column" width="100%">
      <StatusBar
        modelName={modelName}
        messageCount={messages.length}
        displayOptions={displayOptions}
        enableThinking={enableThinking}
      />

      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        <MessageList messages={messages} options={displayOptions} />

        {isStreaming &&
          currentThinking &&
          displayOptions.showThinking && (
            <Box marginTop={1}>
              <StreamingMessage
                content={currentThinking}
                isThinking
                options={displayOptions}
              />
            </Box>
          )}

        {isStreaming && currentResponse && (
          <Box marginTop={1}>
            <StreamingMessage
              content={currentResponse}
              options={displayOptions}
            />
          </Box>
        )}

        {(isStreaming || isInitializing) &&
          !currentResponse &&
          !currentThinking && (
            <Box marginTop={1}>
              <Spinner
                label={isInitializing ? "Connecting..." : "Thinking..."}
              />
            </Box>
          )}

        {error && (
          <Box marginY={0}>
            <Text color="red">Error: {error}</Text>
          </Box>
        )}
      </Box>

      {settingsOpen ? (
        <SettingsPanel
          displayOptions={displayOptions}
          enableThinking={enableThinking}
          onChangeDisplay={setDisplayOptions}
          onChangeThinking={setEnableThinking}
          onClose={() => setSettingsOpen(false)}
        />
      ) : (
        <ChatInput
          onSubmit={handleSubmit}
          isDisabled={isStreaming || isInitializing}
        />
      )}
    </Box>
  );
}

export async function startChat(options: ChatOptions): Promise<void> {
  const instance = render(<ChatApp options={options} />);
  await instance.waitUntilExit();
}
