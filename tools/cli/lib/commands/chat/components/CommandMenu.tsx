import React from "react";
import { Box, Text } from "ink";

export interface CommandMenuItem {
  name: string;
  description: string;
}

interface CommandMenuProps {
  items: CommandMenuItem[];
  selectedIndex: number;
}

export function CommandMenu({ items, selectedIndex }: CommandMenuProps) {
  if (items.length === 0) return null;

  const maxNameLen = Math.max(...items.map((item) => item.name.length));

  return (
    <Box flexDirection="column" paddingX={1}>
      {items.map((item, i) => {
        const isSelected = i === selectedIndex;
        const paddedName = item.name.padEnd(maxNameLen + 4);
        return (
          <Text key={item.name}>
            <Text color={isSelected ? "cyan" : undefined}>
              {isSelected ? "→ " : "  "}
            </Text>
            <Text color="cyan">{paddedName}</Text>
            <Text dimColor>{item.description}</Text>
          </Text>
        );
      })}
      <Text dimColor>
        {"  "}({selectedIndex + 1}/{items.length})
      </Text>
    </Box>
  );
}
