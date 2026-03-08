import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { getCommands } from "../app.js";
import { CommandMenu } from "./CommandMenu.js";

interface ChatInputProps {
  onSubmit: (value: string) => void;
  isDisabled: boolean;
}

export function ChatInput({ onSubmit, isDisabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);

  // Compute matching commands
  const menuItems = (() => {
    if (!value.startsWith("/") || isDisabled || menuDismissed) return [];
    const prefix = value.slice(1).toLowerCase();
    return getCommands().filter((cmd) => cmd.name.startsWith(prefix));
  })();

  const menuVisible = menuItems.length > 0;

  const handleChange = useCallback(
    (newValue: string) => {
      setValue(newValue);
      setSelectedIndex(0);
      // Re-show menu when user types
      if (newValue.startsWith("/")) {
        setMenuDismissed(false);
      }
    },
    [],
  );

  const completeSelection = useCallback(() => {
    if (!menuVisible || !menuItems[selectedIndex]) return;
    const cmd = menuItems[selectedIndex]!;
    setValue(`/${cmd.name}`);
    setMenuDismissed(true);
  }, [menuVisible, menuItems, selectedIndex]);

  const handleSubmit = useCallback(
    (input: string) => {
      if (!input.trim() || isDisabled) return;
      // If menu is visible, execute the selected command directly
      if (menuVisible && menuItems[selectedIndex]) {
        const cmd = menuItems[selectedIndex]!;
        onSubmit(`/${cmd.name}`);
        setValue("");
        setSelectedIndex(0);
        setMenuDismissed(false);
        return;
      }
      onSubmit(input);
      setValue("");
      setSelectedIndex(0);
      setMenuDismissed(false);
    },
    [isDisabled, menuVisible, completeSelection, onSubmit],
  );

  useInput(
    (input, key) => {
      if (!menuVisible) return;

      if (key.downArrow) {
        setSelectedIndex((prev) =>
          prev < menuItems.length - 1 ? prev + 1 : 0,
        );
      } else if (key.upArrow) {
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : menuItems.length - 1,
        );
      } else if (key.tab) {
        completeSelection();
      } else if (key.escape) {
        setValue("");
        setMenuDismissed(true);
      }
    },
    { isActive: menuVisible },
  );

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
      >
        <TextInput
          value={value}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder={
            isDisabled ? "Waiting for response..." : "Type a message..."
          }
        />
      </Box>
      {menuVisible && (
        <CommandMenu items={menuItems} selectedIndex={selectedIndex} />
      )}
    </Box>
  );
}
