import { useState, useCallback } from "react";
import { Box, useInput } from "ink";
import TextInput from "ink-text-input";
import { filterSlashItems, type SlashItem } from "@eclaire/core";
import { CommandMenu } from "./CommandMenu.js";

interface ChatInputProps {
  onSubmit: (value: string) => void;
  isDisabled: boolean;
  slashItems: SlashItem[];
}

export function ChatInput({
  onSubmit,
  isDisabled,
  slashItems,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);

  // Compute matching items from the shared slash registry
  const menuItems = (() => {
    if (!value.startsWith("/") || isDisabled || menuDismissed) return [];
    const query = value.slice(1);
    return filterSlashItems(slashItems, query);
  })();

  const menuVisible = menuItems.length > 0;

  const handleChange = useCallback((newValue: string) => {
    setValue(newValue);
    setSelectedIndex(0);
    if (newValue.startsWith("/")) {
      setMenuDismissed(false);
    }
  }, []);

  const completeSelection = useCallback(() => {
    if (!menuVisible || !menuItems[selectedIndex]) return;
    const item = menuItems[selectedIndex];
    if (!item) return;
    if (item.insertsText) {
      // Skills: insert scaffold text
      setValue(`/skill ${item.id} `);
    } else {
      setValue(`/${item.id}`);
    }
    setMenuDismissed(true);
  }, [menuVisible, menuItems, selectedIndex]);

  const handleSubmit = useCallback(
    (input: string) => {
      if (!input.trim() || isDisabled) return;
      // If menu is visible, execute the selected item directly
      const item = menuVisible ? menuItems[selectedIndex] : undefined;
      if (item) {
        if (item.insertsText) {
          // Skill: insert scaffold and keep editing
          setValue(`/skill ${item.id} `);
          setMenuDismissed(true);
          return;
        }
        // Command or agent: submit for execution
        const submitText =
          item.kind === "agent" ? `/agent ${item.id}` : `/${item.id}`;
        onSubmit(submitText);
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
    [isDisabled, menuVisible, menuItems, selectedIndex, onSubmit],
  );

  useInput(
    (_input, key) => {
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
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
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
