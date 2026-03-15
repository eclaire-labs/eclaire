import { DEFAULT_AGENT_ACTOR_ID } from "@eclaire/api-types";
import { useNavigate } from "@tanstack/react-router";
import {
  Bot,
  History,
  Info,
  MessageSquare,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { ChatPanel } from "@/components/assistant/chat-panel";
import { ConversationHistoryDialog } from "@/components/assistant/conversation-history-dialog";
import { DeleteConfirmDialog } from "@/components/detail-page/DeleteConfirmDialog";
import {
  useToolExecutionTracker,
  type ToolCall,
} from "@/components/assistant/tool-execution-tracker";
import { ModelPicker } from "@/components/settings/ModelPicker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  createAgent,
  deleteAgent,
  getAgent,
  getAgentCatalog,
  listAgents,
  updateAgent,
  type AgentPayload,
} from "@/lib/api-agents";
import {
  createSession,
  deleteSession,
  getSessionWithMessages,
  listSessions,
} from "@/lib/api-sessions";
import { convertBackendMessage } from "@/lib/message-utils";
import {
  type StreamingRequest,
  useStreamingClient,
} from "@/lib/streaming-client";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";
import type { Agent, AgentCatalogItem } from "@/types/agent";
import type { ConversationSummary } from "@/types/conversation";
import type { AssetReference, Message } from "@/types/message";
import { convertToToolCallSummary } from "@/types/message";

function buildWelcomeMessage(agentName: string): Message {
  return {
    id: `welcome-${agentName}`,
    role: "assistant",
    content: `You are chatting with ${agentName}. Ask a question, give it a job, or switch to Configure to tune its prompt, tools, and skills.`,
    timestamp: new Date(),
  };
}

function createEmptyDraft(): AgentPayload {
  return {
    name: "New Agent",
    description: "Focused assistant for a specific workflow.",
    systemPrompt:
      "You are a focused AI agent. Be precise, use the tools you have been given, and stay within your area of responsibility.",
    toolNames: [],
    skillNames: [],
    modelId: null,
  };
}

const LOAD_SKILL_TOOL_NAME = "loadSkill";

export function AgentChecklist({
  title,
  description,
  items,
  selectedNames,
  lockedNames,
  onToggle,
  disabled,
}: {
  title: string;
  description: string;
  items: AgentCatalogItem[];
  selectedNames: string[];
  lockedNames?: string[];
  onToggle: (name: string, checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-[calc(50vh-8rem)] overflow-y-auto pr-1">
          <div className="space-y-3">
            {items.map((item) => {
              const checked = selectedNames.includes(item.name);
              const isLocked = lockedNames?.includes(item.name) ?? false;
              const isUnavailable =
                item.availability !== undefined &&
                item.availability !== "available";
              const isToggleDisabled =
                disabled || isLocked || (isUnavailable && !checked);
              return (
                <div
                  key={item.name}
                  className="flex items-start gap-3 rounded-xl border bg-background px-3 py-3"
                >
                  <Checkbox
                    id={`${title}-${item.name}`}
                    checked={checked}
                    onCheckedChange={(value) =>
                      onToggle(item.name, value === true)
                    }
                    className="mt-0.5"
                    disabled={isToggleDisabled}
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`${title}-${item.name}`}
                        className="text-sm font-medium"
                      >
                        {item.label || item.name}
                      </Label>
                      <Badge
                        variant="secondary"
                        className="font-mono text-[10px]"
                      >
                        {item.name}
                      </Badge>
                      {isLocked && (
                        <Badge variant="outline" className="text-[10px]">
                          Required
                        </Badge>
                      )}
                      {item.name === "browseChrome" && (
                        <>
                          <Badge variant="outline" className="text-[10px]">
                            Local only
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            Signed-in Chrome
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            Interactive
                          </Badge>
                        </>
                      )}
                      {item.availability === "setup_required" && (
                        <Badge variant="secondary" className="text-[10px]">
                          Setup required
                        </Badge>
                      )}
                      {item.availability === "disabled" && (
                        <Badge variant="secondary" className="text-[10px]">
                          Disabled
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.description}
                    </p>
                    {item.availabilityReason && (
                      <p className="text-xs text-muted-foreground">
                        {item.availabilityReason}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface AssistantSettingsProps {
  selectedAgentId: string;
}

export default function AssistantSettings({
  selectedAgentId,
}: AssistantSettingsProps) {
  const navigate = useNavigate();
  const [preferences, , isLoaded] = useAssistantPreferences();

  const [_agents, setAgents] = useState<Agent[]>([]);
  const [catalog, setCatalog] = useState<{
    tools: AgentCatalogItem[];
    skills: AgentCatalogItem[];
  }>({ tools: [], skills: [] });
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [draft, setDraft] = useState<AgentPayload>(createEmptyDraft());
  const [draftTemplate, setDraftTemplate] = useState<AgentPayload | null>(null);
  const [activeMode, setActiveMode] = useState<"chat" | "configure">("chat");
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [attachedAssets, setAttachedAssets] = useState<AssetReference[]>([]);
  const [currentConversation, setCurrentConversation] =
    useState<ConversationSummary | null>(null);
  const [sessions, setSessions] = useState<ConversationSummary[]>([]);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingThought, setStreamingThought] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const finalStreamingTextRef = useRef("");
  const finalStreamingThoughtRef = useRef("");

  const {
    toolCalls: streamingToolCalls,
    addOrUpdateTool,
    clearTools,
  } = useToolExecutionTracker();

  const selectedAgentName = selectedAgent?.name || draft.name;
  const loadSkillRequired = (draft.skillNames ?? []).length > 0;
  const effectiveToolNames = useMemo(() => {
    const names = new Set(draft.toolNames ?? []);
    if (loadSkillRequired) {
      names.add(LOAD_SKILL_TOOL_NAME);
    }
    return Array.from(names);
  }, [draft.toolNames, loadSkillRequired]);

  const refreshAgents = useCallback(async () => {
    const [agentList, agentCatalog] = await Promise.all([
      listAgents(),
      getAgentCatalog(),
    ]);
    setAgents(agentList.items);
    setCatalog(agentCatalog);
  }, []);

  const refreshSessions = useCallback(async (agentActorId: string) => {
    const response = await listSessions(20, 0, agentActorId);
    setSessions(response.items);
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setIsLoadingAgents(true);
      try {
        await refreshAgents();
      } catch (error) {
        if (!mounted) return;
        toast.error(
          error instanceof Error ? error.message : "Failed to load agents",
        );
      } finally {
        if (mounted) {
          setIsLoadingAgents(false);
        }
      }
    };

    load();

    const onAgentsUpdated = () => {
      load();
    };

    window.addEventListener("agents-updated", onAgentsUpdated);
    return () => {
      mounted = false;
      window.removeEventListener("agents-updated", onAgentsUpdated);
    };
  }, [refreshAgents]);

  useEffect(() => {
    let cancelled = false;

    const loadSelectedAgent = async () => {
      if (selectedAgentId === "new") {
        setSelectedAgent(null);
        setDraft(draftTemplate ?? createEmptyDraft());
        setCurrentConversation(null);
        setSessions([]);
        setMessages([buildWelcomeMessage("your new agent")]);
        setActiveMode("configure");
        setDraftTemplate(null);
        return;
      }

      try {
        const agent = await getAgent(selectedAgentId);
        if (cancelled) {
          return;
        }
        setSelectedAgent(agent);
        setDraft({
          name: agent.name,
          description: agent.description,
          systemPrompt: agent.systemPrompt,
          toolNames: agent.toolNames,
          skillNames: agent.skillNames,
          modelId: agent.modelId ?? null,
        });
        setMessages([buildWelcomeMessage(agent.name)]);
        setCurrentConversation(null);
        await refreshSessions(agent.id);
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "Failed to load agent",
          );
        }
      }
    };

    loadSelectedAgent();

    return () => {
      cancelled = true;
    };
  }, [draftTemplate, refreshSessions, selectedAgentId]);

  const streamingClient = useStreamingClient({
    onThought: (content) => {
      finalStreamingThoughtRef.current += content;
      setStreamingThought((prev) => prev + content);
    },
    onToolCall: (name, status, args, result, error) => {
      addOrUpdateTool(name, status, args, result, error);
    },
    onTextChunk: (content) => {
      finalStreamingTextRef.current += content;
      setStreamingText((prev) => prev + content);
    },
    onError: (error) => {
      setIsStreaming(false);
      finalStreamingTextRef.current = "";
      finalStreamingThoughtRef.current = "";
      toast.error(error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: error,
          timestamp: new Date(),
          isError: true,
        },
      ]);
    },
    onDone: async () => {
      const finalContent = finalStreamingTextRef.current.trim();
      if (finalContent) {
        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: finalContent,
          timestamp: new Date(),
          thinkingContent: finalStreamingThoughtRef.current.trim() || null,
          toolCalls:
            streamingToolCalls.length > 0
              ? streamingToolCalls.map(convertToToolCallSummary)
              : undefined,
        };
        flushSync(() => {
          setMessages((prev) => [...prev, assistantMessage]);
        });
      }
      setIsStreaming(false);
      setStreamingText("");
      setStreamingThought("");
      finalStreamingTextRef.current = "";
      finalStreamingThoughtRef.current = "";
      clearTools();
      if (selectedAgentId !== "new") {
        await refreshSessions(selectedAgentId);
      }
    },
  });

  const handleSessionSelect = async (session: ConversationSummary) => {
    setIsLoadingSession(true);
    try {
      const loaded = await getSessionWithMessages(session.id);
      setCurrentConversation(session);
      setMessages(loaded.messages.map(convertBackendMessage));
      setActiveMode("chat");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load session",
      );
    } finally {
      setIsLoadingSession(false);
    }
  };

  const startNewChat = () => {
    setCurrentConversation(null);
    setMessages([buildWelcomeMessage(selectedAgentName)]);
    setInput("");
    setStreamingText("");
    setStreamingThought("");
    finalStreamingTextRef.current = "";
    finalStreamingThoughtRef.current = "";
    setIsStreaming(false);
    clearTools();
  };

  const handleDeleteSession = async (id: string) => {
    await deleteSession(id);
    if (currentConversation?.id === id) {
      startNewChat();
    }
    if (selectedAgentId !== "new") {
      await refreshSessions(selectedAgentId);
    }
  };

  const handleDeleteAllSessions = async () => {
    await Promise.all(sessions.map((s) => deleteSession(s.id)));
    startNewChat();
    if (selectedAgentId !== "new") {
      await refreshSessions(selectedAgentId);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || selectedAgentId === "new" || !isLoaded) {
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input,
      timestamp: new Date(),
    };
    const prompt = input;
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);
    setStreamingThought("");
    setStreamingText("");
    finalStreamingTextRef.current = "";
    finalStreamingThoughtRef.current = "";
    clearTools();

    try {
      let sessionId = currentConversation?.id;
      if (!sessionId) {
        const session = await createSession({
          agentActorId: selectedAgentId,
        });
        sessionId = session.id;
        setCurrentConversation(session);
      }

      const request: StreamingRequest = {
        sessionId,
        prompt,
        enableThinking: preferences.showThinkingTokens,
        context:
          attachedAssets.length > 0
            ? {
                agentActorId: selectedAgentId,
                assets: attachedAssets.map((asset) => ({
                  type: asset.type,
                  id: asset.id,
                })),
              }
            : { agentActorId: selectedAgentId },
      };

      await streamingClient.startStream(request);
    } catch (error) {
      setIsStreaming(false);
      toast.error(
        error instanceof Error ? error.message : "Failed to send message",
      );
    }
  };

  const toggleDraftArray = (
    key: "toolNames" | "skillNames",
    name: string,
    checked: boolean,
  ) => {
    setDraft((prev) => {
      const current = new Set(prev[key] ?? []);
      if (checked) {
        current.add(name);
      } else {
        current.delete(name);
      }
      return { ...prev, [key]: Array.from(current) };
    });
  };

  const saveAgent = async () => {
    setIsSaving(true);

    try {
      const payload: AgentPayload = {
        name: draft.name.trim(),
        description: draft.description?.trim() || null,
        systemPrompt: draft.systemPrompt.trim(),
        toolNames: effectiveToolNames,
        skillNames: draft.skillNames ?? [],
        modelId: draft.modelId ?? null,
      };

      const savedAgent =
        selectedAgentId === "new"
          ? await createAgent(payload)
          : await updateAgent(selectedAgentId, payload);

      window.dispatchEvent(new Event("agents-updated"));
      toast.success(
        selectedAgentId === "new"
          ? `${savedAgent.name} created`
          : `${savedAgent.name} updated`,
      );

      navigate({
        to: "/agents/$agentId",
        params: { agentId: savedAgent.id },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save agent",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAgent = async () => {
    if (!selectedAgent || !selectedAgent.isEditable) {
      return;
    }

    setIsSaving(true);

    try {
      await deleteAgent(selectedAgent.id);
      window.dispatchEvent(new Event("agents-updated"));
      setShowDeleteDialog(false);
      toast.success(`${selectedAgent.name} deleted`);
      navigate({
        to: "/agents/$agentId",
        params: { agentId: DEFAULT_AGENT_ACTOR_ID },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete agent",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const duplicateBuiltin = () => {
    if (!selectedAgent) {
      return;
    }

    setDraftTemplate({
      name: `${selectedAgent.name} Copy`,
      description: selectedAgent.description,
      systemPrompt: selectedAgent.systemPrompt,
      toolNames: selectedAgent.toolNames,
      skillNames: selectedAgent.skillNames,
      modelId: null,
    });
    navigate({
      to: "/agents/$agentId",
      params: { agentId: "new" },
    });
  };

  const selectedTools = useMemo(
    () =>
      effectiveToolNames
        .map(
          (name) =>
            catalog.tools.find((tool) => tool.name === name)?.label || name,
        )
        .slice(0, 4),
    [catalog.tools, effectiveToolNames],
  );

  const isNew = selectedAgentId === "new";
  const isReadOnly = selectedAgent?.isEditable === false && !isNew;

  if (!isLoaded || isLoadingAgents) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Agents
          </CardTitle>
          <CardDescription>Loading agent workspace...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-none bg-[linear-gradient(135deg,hsl(var(--primary)/0.14),hsl(var(--background))_58%,hsl(var(--accent)/0.24))] shadow-sm">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background/80 shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-semibold">{selectedAgentName}</h2>
                <Badge
                  variant={selectedAgent?.isEditable ? "secondary" : "outline"}
                >
                  {selectedAgent?.isEditable ? "Custom" : "System"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {draft.description ||
                  "Focused workspace agent with its own prompt, tools, and skills."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {effectiveToolNames.length} tools enabled
            </Badge>
            <Badge variant="secondary">
              {(draft.skillNames ?? []).length} skills enabled
            </Badge>
            {selectedTools.map((tool) => (
              <Badge key={tool} variant="outline">
                {tool}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs
        value={activeMode}
        onValueChange={(value) => setActiveMode(value as "chat" | "configure")}
        className="space-y-4"
      >
        <TabsList
          className={`grid w-full ${isNew ? "grid-cols-1" : "grid-cols-2"} md:w-[280px]`}
        >
          {!isNew && (
            <TabsTrigger value="chat">
              <MessageSquare className="mr-2 h-4 w-4" />
              Chat
            </TabsTrigger>
          )}
          <TabsTrigger value="configure">
            <Settings2 className="mr-2 h-4 w-4" />
            Configure
          </TabsTrigger>
        </TabsList>

        {!isNew && (
          <TabsContent value="chat" className="mt-0">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Agent Chat
                  </CardTitle>
                  <CardDescription>
                    Each chat stays pinned to this agent's current identity and
                    capabilities.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {sessions.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowHistory(true)}
                    >
                      <History className="mr-2 h-4 w-4" />
                      History ({sessions.length})
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={startNewChat}>
                    <Plus className="mr-2 h-4 w-4" />
                    New Chat
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="h-[640px]">
                <ChatPanel
                  messages={messages}
                  isLoading={isLoadingSession}
                  currentConversation={currentConversation}
                  input={input}
                  setInput={setInput}
                  handleSend={handleSend}
                  handleKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                  attachedAssets={attachedAssets}
                  setAttachedAssets={setAttachedAssets}
                  isStreaming={isStreaming}
                  streamingThought={streamingThought}
                  streamingText={streamingText}
                  streamingToolCalls={streamingToolCalls as ToolCall[]}
                  showThinkingTokens={preferences.showThinkingTokens}
                  className="h-full"
                />
                <div ref={messagesEndRef} />
                <div ref={inputRef} />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="configure" className="mt-0 space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Agent Identity
                </CardTitle>
                <CardDescription>
                  Shape what this agent is for before you fine-tune the
                  capabilities below.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {isReadOnly && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Eclaire stays system-owned</AlertTitle>
                    <AlertDescription>
                      The default agent is read-only. Duplicate it to create a
                      custom variant you can tailor.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="agent-name">Name</Label>
                    <Input
                      id="agent-name"
                      value={draft.name}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      }
                      disabled={isReadOnly || isSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agent-description">Description</Label>
                    <Input
                      id="agent-description"
                      value={draft.description || ""}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                      disabled={isReadOnly || isSaving}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agent-model">Model</Label>
                  <ModelPicker
                    value={draft.modelId ?? null}
                    onChange={(modelId) =>
                      setDraft((prev) => ({ ...prev, modelId }))
                    }
                    disabled={isReadOnly || isSaving}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave as &quot;System Default&quot; to use the globally
                    configured model.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agent-prompt">System Prompt</Label>
                  <Textarea
                    id="agent-prompt"
                    value={draft.systemPrompt}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        systemPrompt: event.target.value,
                      }))
                    }
                    className="min-h-48 font-mono text-sm"
                    disabled={isReadOnly || isSaving}
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  {isReadOnly ? (
                    <Button onClick={duplicateBuiltin}>
                      <Plus className="mr-2 h-4 w-4" />
                      Duplicate as Custom Agent
                    </Button>
                  ) : (
                    <Button onClick={saveAgent} disabled={isSaving}>
                      <Save className="mr-2 h-4 w-4" />
                      {isNew ? "Create Agent" : "Save Changes"}
                    </Button>
                  )}

                  {selectedAgent?.isEditable && (
                    <Button
                      variant="outline"
                      onClick={() => setShowDeleteDialog(true)}
                      disabled={isSaving}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Agent
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
              <AgentChecklist
                title="Tools"
                description="These are the actions the agent can take inside the workspace."
                items={catalog.tools}
                selectedNames={effectiveToolNames}
                lockedNames={loadSkillRequired ? [LOAD_SKILL_TOOL_NAME] : []}
                onToggle={(name, checked) =>
                  toggleDraftArray("toolNames", name, checked)
                }
                disabled={isReadOnly || isSaving}
              />

              <AgentChecklist
                title="Skills"
                description="Skills shape the prompt and can be loaded on demand by compatible agents."
                items={catalog.skills}
                selectedNames={draft.skillNames ?? []}
                onToggle={(name, checked) =>
                  toggleDraftArray("skillNames", name, checked)
                }
                disabled={isReadOnly || isSaving}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        label="Agent"
        onConfirm={handleDeleteAgent}
        isDeleting={isSaving}
      />

      <ConversationHistoryDialog
        open={showHistory}
        onOpenChange={setShowHistory}
        onSelectConversation={handleSessionSelect}
        onDeleteConversation={handleDeleteSession}
        onDeleteAllConversations={handleDeleteAllSessions}
        currentConversationId={currentConversation?.id}
        agentActorId={selectedAgentId !== "new" ? selectedAgentId : undefined}
      />
    </div>
  );
}
