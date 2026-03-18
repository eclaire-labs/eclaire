import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import {
  buildSlashItems,
  generateHelpText,
  parseSlashInput,
  type SlashContext,
  type SlashItem,
} from "@eclaire/core";
import {
  getModelInfo,
  createSession,
  getSession as getSessionApi,
  listAgents,
  listSessions,
  sendMessage,
  abortSession,
  type AgentSummary,
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
  const existing = updated[idx];
  if (!existing) return updated;
  const toolCall = existing.toolCall;
  if (!toolCall) return updated;
  updated[idx] = {
    ...existing,
    toolCall: {
      ...toolCall,
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
  const [, setSessionId] = useState<string | undefined>(undefined);
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
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [activeAgentId, setActiveAgentId] = useState("eclaire");

  // Build slash context and items for the CLI surface
  const slashCtx: SlashContext = useMemo(
    () => ({
      activeAgentId,
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        skillNames: a.skillNames,
      })),
      surface: "cli" as const,
    }),
    [activeAgentId, agents],
  );

  const slashItems: SlashItem[] = useMemo(
    () => buildSlashItems(slashCtx),
    [slashCtx],
  );

  // Initialize: fetch model info, agents, and create/load session
  useEffect(() => {
    const init = async () => {
      try {
        const [info] = await Promise.all([
          getModelInfo().catch(() => null),
          listAgents()
            .then((items) => setAgents(items))
            .catch(() => {}),
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
  }, [options]);

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

      // Handle slash commands via shared registry
      const resolved = parseSlashInput(input, slashCtx);
      if (resolved) {
        switch (resolved.type) {
          case "execute-command":
            switch (resolved.commandId) {
              case "help": {
                const helpText = generateHelpText(slashItems);
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: helpText },
                ]);
                return;
              }
              case "clear":
                setMessages([]);
                setError(null);
                return;
              case "new":
                try {
                  const session = await createSession(undefined, activeAgentId);
                  setSessionId(session.id);
                  sessionIdRef.current = session.id;
                  setMessages([]);
                  setError(null);
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Failed to create session",
                  );
                }
                return;
              case "model":
                setMessages((prev) => [
                  ...prev,
                  {
                    role: "assistant",
                    content: `Current model: ${modelName}`,
                  },
                ]);
                return;
              case "history":
                try {
                  const sessions = await listSessions(10);
                  if (sessions.length === 0) {
                    setMessages((prev) => [
                      ...prev,
                      { role: "assistant", content: "No sessions found." },
                    ]);
                    return;
                  }
                  const lines = sessions.map(
                    (s) =>
                      `${s.id.slice(0, 8)} — ${s.title || "(untitled)"} (${s.messageCount} msgs)`,
                  );
                  setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: lines.join("\n") },
                  ]);
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Failed to list sessions",
                  );
                }
                return;
              case "thinking":
                setEnableThinking((prev) => !prev);
                return;
              case "exit":
                exit();
                return;
            }
            return;
          case "switch-agent":
            setActiveAgentId(resolved.agentId);
            try {
              const session = await createSession(undefined, resolved.agentId);
              setSessionId(session.id);
              sessionIdRef.current = session.id;
              setMessages([]);
              setError(null);
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `Switched to ${resolved.agentName}. New session started.`,
                },
              ]);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Failed to switch agent",
              );
            }
            return;
          case "send-rewritten":
            // Fall through to send the rewritten text as a normal message
            input = resolved.text;
            break;
          case "insert-scaffold":
            // CLI: just show a message since we can't insert into the input
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Type: ${resolved.text}<your task>`,
              },
            ]);
            return;
          case "error":
            setError(resolved.message);
            return;
        }
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
        setError(err instanceof Error ? err.message : "Failed to get response");
      } finally {
        setIsStreaming(false);
      }
    },
    [
      isStreaming,
      modelName,
      exit,
      enableThinking,
      slashCtx,
      slashItems,
      activeAgentId,
    ],
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

        {isStreaming && currentThinking && displayOptions.showThinking && (
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
          slashItems={slashItems}
        />
      )}
    </Box>
  );
}

export async function startChat(options: ChatOptions): Promise<void> {
  const instance = render(<ChatApp options={options} />);
  await instance.waitUntilExit();
}
