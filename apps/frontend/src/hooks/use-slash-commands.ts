import { useCallback, useMemo } from "react";
import type { SlashItem } from "@eclaire/core/slash";
import {
  buildSlashItems,
  filterSlashItems,
  parseSlashInput,
  type SlashContext,
} from "@eclaire/core/slash";

interface SlashCommandActions {
  onNewConversation: () => void;
  onClearConversation: () => void;
  onShowHistory: () => void;
  onToggleThinking: () => void;
  onShowModel: () => void;
  onShowHelp: (items: SlashItem[]) => void;
  onSwitchAgent: (agentId: string) => void;
  onSendMessage: (text: string) => void;
}

interface UseSlashCommandsOptions {
  assistantAgentId: string;
  agents: { id: string; name: string; skillNames: string[] }[];
  input: string;
  setInput: (value: string) => void;
  actions: SlashCommandActions;
}

export interface SlashPaletteState {
  open: boolean;
  items: SlashItem[];
  query: string;
}

export interface UseSlashCommandsReturn {
  palette: SlashPaletteState;
  closePalette: () => void;
  handleSelect: (item: SlashItem) => void;
  /** Wraps the original handleSend — returns true if the slash command was handled */
  interceptSend: (text: string) => boolean;
  /** Wraps the original handleKeyDown — adds Escape to close palette */
  interceptKeyDown: (e: React.KeyboardEvent) => boolean;
}

export function useSlashCommands({
  assistantAgentId,
  agents,
  input,
  setInput,
  actions,
}: UseSlashCommandsOptions): UseSlashCommandsReturn {
  const ctx: SlashContext = useMemo(
    () => ({
      activeAgentId: assistantAgentId,
      agents,
      surface: "web" as const,
    }),
    [assistantAgentId, agents],
  );

  const allItems = useMemo(() => buildSlashItems(ctx), [ctx]);

  // Palette state derived from input
  const palette = useMemo((): SlashPaletteState => {
    const trimmed = input.trimStart();
    if (!trimmed.startsWith("/")) {
      return { open: false, items: [], query: "" };
    }
    // Extract query: text after "/" up to end (or first space for skill/agent subcommand)
    const query = trimmed.slice(1);
    const filtered = filterSlashItems(allItems, query);
    return { open: true, items: filtered, query };
  }, [input, allItems]);

  const closePalette = useCallback(() => {
    setInput("");
  }, [setInput]);

  const executeAction = useCallback(
    (item: SlashItem) => {
      switch (item.kind) {
        case "command":
          switch (item.id) {
            case "new":
              actions.onNewConversation();
              break;
            case "clear":
              actions.onClearConversation();
              break;
            case "history":
              actions.onShowHistory();
              break;
            case "thinking":
              actions.onToggleThinking();
              break;
            case "model":
              actions.onShowModel();
              break;
            case "help":
              actions.onShowHelp(allItems);
              break;
          }
          setInput("");
          break;
        case "agent":
          actions.onSwitchAgent(item.id);
          setInput("");
          break;
        case "skill":
          // Insert scaffold into composer
          setInput(`/skill ${item.id} `);
          break;
      }
    },
    [actions, allItems, setInput],
  );

  const handleSelect = useCallback(
    (item: SlashItem) => {
      executeAction(item);
    },
    [executeAction],
  );

  const interceptSend = useCallback(
    (text: string): boolean => {
      const resolved = parseSlashInput(text, ctx);
      if (!resolved) return false;

      switch (resolved.type) {
        case "execute-command": {
          const item = allItems.find(
            (i: SlashItem) =>
              i.kind === "command" && i.id === resolved.commandId,
          );
          if (item) executeAction(item);
          return true;
        }
        case "switch-agent":
          actions.onSwitchAgent(resolved.agentId);
          setInput("");
          return true;
        case "send-rewritten":
          actions.onSendMessage(resolved.text);
          setInput("");
          return true;
        case "insert-scaffold":
          setInput(resolved.text);
          return true;
        case "error":
          console.warn("Slash command error:", resolved.message);
          setInput("");
          return true;
        default:
          return false;
      }
    },
    [ctx, allItems, executeAction, actions, setInput],
  );

  const interceptKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (e.key === "Escape" && palette.open) {
        e.preventDefault();
        closePalette();
        return true;
      }
      return false;
    },
    [palette.open, closePalette],
  );

  return {
    palette,
    closePalette,
    handleSelect,
    interceptSend,
    interceptKeyDown,
  };
}
