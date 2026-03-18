import { Box, Text } from "ink";
import type { SlashItem } from "@eclaire/core";

interface CommandMenuProps {
  items: SlashItem[];
  selectedIndex: number;
}

const KIND_LABELS: Record<string, string> = {
  command: "Commands",
  agent: "Agents",
  skill: "Skills",
};

export function CommandMenu({ items, selectedIndex }: CommandMenuProps) {
  if (items.length === 0) return null;

  const maxNameLen = Math.max(...items.map((item) => item.label.length));

  // Group items by kind for display
  let lastKind: string | null = null;

  return (
    <Box flexDirection="column" paddingX={1}>
      {items.map((item, i) => {
        const isSelected = i === selectedIndex;
        const paddedName = item.label.padEnd(maxNameLen + 4);
        const showHeader = item.kind !== lastKind;
        lastKind = item.kind;

        return (
          <Box key={`${item.kind}-${item.id}`} flexDirection="column">
            {showHeader && (
              <Text dimColor bold>
                {"  "}
                {KIND_LABELS[item.kind] || item.kind}
              </Text>
            )}
            <Text>
              <Text color={isSelected ? "cyan" : undefined}>
                {isSelected ? "→ " : "  "}
              </Text>
              <Text color="cyan">/{paddedName}</Text>
              <Text dimColor>{item.description}</Text>
            </Text>
          </Box>
        );
      })}
      <Text dimColor>
        {"  "}({selectedIndex + 1}/{items.length})
      </Text>
    </Box>
  );
}
