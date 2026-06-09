import { DEFAULT_AGENT_ACTOR_ID } from "@eclaire/api-types";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Bot,
  Info,
  MessageSquare,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ConversationHistoryDialog } from "@/components/assistant/conversation-history-dialog";
import { DeleteConfirmDialog } from "@/components/detail-page/DeleteConfirmDialog";
import { AgentChatPane } from "@/components/settings/assistant/AgentChatPane";
import { AgentChecklist } from "@/components/settings/assistant/AgentChecklist";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAgentCatalog, useAgents } from "@/hooks/use-agents";
import { useAssistantChat } from "@/hooks/use-assistant-chat";
import { useSlashCommands } from "@/hooks/use-slash-commands";
import {
  type AgentPayload,
  createAgent,
  deleteAgent,
  getAgent,
  updateAgent,
} from "@/lib/api-agents";
import {
  deleteSession,
  getSessionWithMessages,
  listSessions,
  markSessionRead,
} from "@/lib/api-sessions";
import { convertBackendMessage } from "@/lib/message-utils";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";
import type { Agent, AgentCatalog } from "@/types/agent";
import type { ConversationSummary } from "@/types/conversation";
import type { Message } from "@/types/message";

export { AgentChecklist } from "@/components/settings/assistant/AgentChecklist";

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

const EMPTY_CATALOG: AgentCatalog = { tools: [], skills: [] };

interface AssistantSettingsProps {
  selectedAgentId: string;
}

export default function AssistantSettings({
  selectedAgentId,
}: AssistantSettingsProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [preferences, , isLoaded] = useAssistantPreferences();

  const { data: agents = [], isLoading: isLoadingAgentList } = useAgents();
  const { data: catalog = EMPTY_CATALOG, isLoading: isLoadingCatalog } =
    useAgentCatalog();
  const isLoadingAgents = isLoadingAgentList || isLoadingCatalog;

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [draft, setDraft] = useState<AgentPayload>(createEmptyDraft());
  const [draftTemplate, setDraftTemplate] = useState<AgentPayload | null>(null);
  const [activeMode, setActiveMode] = useState<"chat" | "configure">("chat");
  const [isSaving, setIsSaving] = useState(false);

  const [sessions, setSessions] = useState<ConversationSummary[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [runtimeKind, setRuntimeKind] = useState<"native" | "external_harness">(
    "native",
  );

  const selectedAgentName = selectedAgent?.name || draft.name;
  const isExternalHarness = runtimeKind === "external_harness";
  const loadSkillRequired =
    !isExternalHarness && (draft.skillNames ?? []).length > 0;
  const effectiveToolNames = useMemo(() => {
    if (isExternalHarness) return [];
    const names = new Set(draft.toolNames ?? []);
    if (loadSkillRequired) {
      names.add(LOAD_SKILL_TOOL_NAME);
    }
    return Array.from(names);
  }, [draft.toolNames, loadSkillRequired, isExternalHarness]);

  const refreshSessions = useCallback(async (agentActorId: string) => {
    const response = await listSessions(20, 0, agentActorId);
    setSessions(response.items);
  }, []);

  // Shared assistant chat core (messages, streaming, tool approvals, ...)
  const chat = useAssistantChat({
    agentActorId: selectedAgentId,
    buildWelcomeMessage: () => buildWelcomeMessage(selectedAgentName),
    sendDisabled: selectedAgentId === "new",
    toastOnError: true,
    onConversationLoaded: () => setActiveMode("chat"),
    onStreamDone: async () => {
      if (selectedAgentId !== "new") {
        await refreshSessions(selectedAgentId);
      }
    },
  });
  const { setMessages, setCurrentConversation } = chat;

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
        const response = await listSessions(20, 0, agent.id);
        if (cancelled) return;
        setSessions(response.items);

        // Auto-restore the most recent conversation
        const mostRecent = response.items[0];
        if (mostRecent) {
          const loaded = await getSessionWithMessages(mostRecent.id);
          if (cancelled) return;
          setCurrentConversation(mostRecent);
          setMessages(loaded.messages.map(convertBackendMessage));
        } else {
          setMessages([buildWelcomeMessage(agent.name)]);
          setCurrentConversation(null);
        }

        // Clear unread indicators for all sessions when navigating to the agent page
        const unreadSessions = response.items.filter(
          (s) => s.hasUnreadResponse,
        );
        if (unreadSessions.length > 0) {
          await Promise.all(
            unreadSessions.map((s) => markSessionRead(s.id).catch(() => {})),
          );
          queryClient.invalidateQueries({ queryKey: ["session-status"] });
        }
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
  }, [
    draftTemplate,
    queryClient,
    selectedAgentId,
    setCurrentConversation,
    setMessages,
  ]);

  const handleSessionSelect = (session: ConversationSummary) => {
    chat.loadConversation(session);
  };

  const startNewChat = () => {
    chat.resetConversation();
    chat.setInput("");
  };

  const handleDeleteSession = async (id: string) => {
    await deleteSession(id);
    if (chat.currentConversation?.id === id) {
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

  // Slash commands
  const slashAgents = useMemo(
    () =>
      agents.map((a) => ({
        id: a.id,
        name: a.name,
        skillNames: a.skillNames,
      })),
    [agents],
  );

  const handleSendRef = useRef(chat.handleSend);
  handleSendRef.current = chat.handleSend;
  const startNewChatRef = useRef(startNewChat);
  startNewChatRef.current = startNewChat;

  const slashActions = useMemo(
    () => ({
      onNewConversation: () => startNewChatRef.current(),
      onClearConversation: () => startNewChatRef.current(),
      onShowHistory: () => setShowHistory(true),
      onToggleThinking: () => {},
      onShowModel: () => {},
      onShowHelp: () => {},
      onSwitchAgent: (agentId: string) => {
        navigate({ to: "/agents/$agentId", params: { agentId } });
      },
      onSendMessage: (text: string) => handleSendRef.current(text),
    }),
    [navigate],
  );

  const slash = useSlashCommands({
    assistantAgentId: selectedAgentId,
    agents: slashAgents,
    input: chat.input,
    setInput: chat.setInput,
    actions: slashActions,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slash.interceptKeyDown(e)) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendWithSlash();
    }
  };

  const handleSendWithSlash = (textOverride?: string) => {
    const text = textOverride || chat.input;
    if (slash.interceptSend(text)) return;
    chat.handleSend(textOverride);
  };

  const slashPaletteConfig = slash.palette.open
    ? {
        open: true as const,
        items: slash.palette.items,
        onSelect: slash.handleSelect,
        onClose: slash.closePalette,
      }
    : undefined;

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
        toolNames: isExternalHarness ? [] : effectiveToolNames,
        skillNames: isExternalHarness ? [] : (draft.skillNames ?? []),
        modelId: draft.modelId ?? null,
      };

      const savedAgent =
        selectedAgentId === "new"
          ? await createAgent(payload)
          : await updateAgent(selectedAgentId, payload);

      queryClient.invalidateQueries({ queryKey: ["agents"] });
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
      queryClient.invalidateQueries({ queryKey: ["agents"] });
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
            {isExternalHarness ? (
              <Badge variant="outline">External harness</Badge>
            ) : (
              <>
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
              </>
            )}
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
            <AgentChatPane
              chat={chat}
              sessionCount={sessions.length}
              showThinkingTokens={preferences.showThinkingTokens}
              handleSend={handleSendWithSlash}
              handleKeyDown={handleKeyDown}
              onShowHistory={() => setShowHistory(true)}
              onNewChat={startNewChat}
              slashPalette={slashPaletteConfig}
            />
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
                    onChange={(modelId, kind) => {
                      setRuntimeKind(kind);
                      setDraft((prev) => ({
                        ...prev,
                        modelId,
                        ...(kind === "external_harness"
                          ? { toolNames: [], skillNames: [] }
                          : {}),
                      }));
                    }}
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
              {isExternalHarness ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>External harness runtime</AlertTitle>
                  <AlertDescription>
                    This model runs through an external harness. Eclaire tools,
                    skills, and MCP selection are not used here.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <AgentChecklist
                    title="Tools"
                    description="These are the actions the agent can take inside the workspace."
                    items={catalog.tools}
                    selectedNames={effectiveToolNames}
                    lockedNames={
                      loadSkillRequired ? [LOAD_SKILL_TOOL_NAME] : []
                    }
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
                </>
              )}
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
        currentConversationId={chat.currentConversation?.id}
        agentActorId={selectedAgentId !== "new" ? selectedAgentId : undefined}
      />
    </div>
  );
}
