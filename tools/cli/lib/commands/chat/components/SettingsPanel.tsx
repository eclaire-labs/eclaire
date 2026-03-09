import { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { DisplayOptions } from "../types.js";

interface SettingsPanelProps {
  displayOptions: DisplayOptions;
  enableThinking: boolean;
  onChangeDisplay: React.Dispatch<React.SetStateAction<DisplayOptions>>;
  onChangeThinking: React.Dispatch<React.SetStateAction<boolean>>;
  onClose: () => void;
}

interface SettingItem {
  key: string;
  label: string;
  description: string;
  getValue: (d: DisplayOptions, t: boolean) => boolean;
  toggle: (
    setD: React.Dispatch<React.SetStateAction<DisplayOptions>>,
    setT: React.Dispatch<React.SetStateAction<boolean>>,
  ) => void;
}

const SETTINGS: SettingItem[] = [
  {
    key: "enableThinking",
    label: "Thinking (API)",
    description:
      "Send thinking/reasoning requests to the model (affects speed & cost)",
    getValue: (_d, t) => t,
    toggle: (_setD, setT) => setT((prev) => !prev),
  },
  {
    key: "showThinking",
    label: "Show thinking",
    description: "Display thinking blocks in the conversation",
    getValue: (d) => d.showThinking,
    toggle: (setD) =>
      setD((prev) => ({ ...prev, showThinking: !prev.showThinking })),
  },
  {
    key: "showTools",
    label: "Show tool calls",
    description: "Display tool call details and results",
    getValue: (d) => d.showTools,
    toggle: (setD) => setD((prev) => ({ ...prev, showTools: !prev.showTools })),
  },
  {
    key: "verbose",
    label: "Verbose mode",
    description: "Show full tool results and thinking content (no truncation)",
    getValue: (d) => d.verbose,
    toggle: (setD) => setD((prev) => ({ ...prev, verbose: !prev.verbose })),
  },
];

export function SettingsPanel({
  displayOptions,
  enableThinking,
  onChangeDisplay,
  onChangeThinking,
  onClose,
}: SettingsPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((_input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => (prev < SETTINGS.length - 1 ? prev + 1 : 0));
    } else if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : SETTINGS.length - 1));
    } else if (key.return || _input === " ") {
      const setting = SETTINGS[selectedIndex];
      setting?.toggle(onChangeDisplay, onChangeThinking);
    }
  });

  const maxLabelLen = Math.max(...SETTINGS.map((s) => s.label.length));
  const selected = SETTINGS[selectedIndex];

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="cyan"
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Settings
        </Text>
        <Text dimColor>{"  "}↑↓ navigate · Enter/Space toggle · Esc close</Text>
      </Box>

      {SETTINGS.map((setting, i) => {
        const isSelected = i === selectedIndex;
        const value = setting.getValue(displayOptions, enableThinking);
        const paddedLabel = setting.label.padEnd(maxLabelLen + 2);

        return (
          <Text key={setting.key}>
            <Text color={isSelected ? "cyan" : undefined}>
              {isSelected ? "→ " : "  "}
            </Text>
            <Text color={isSelected ? "cyan" : undefined}>{paddedLabel}</Text>
            <Text color={value ? "green" : "red"}>{value ? "on" : "off"}</Text>
          </Text>
        );
      })}

      <Box marginTop={1}>
        <Text dimColor>{selected?.description}</Text>
      </Box>
    </Box>
  );
}
