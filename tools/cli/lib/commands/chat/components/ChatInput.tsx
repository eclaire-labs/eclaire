import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface ChatInputProps {
  onSubmit: (value: string) => void;
  isDisabled: boolean;
}

export function ChatInput({ onSubmit, isDisabled }: ChatInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (input: string) => {
    if (input.trim() && !isDisabled) {
      onSubmit(input);
      setValue("");
    }
  };

  return (
    <Box borderStyle="single" borderColor={isDisabled ? "gray" : "cyan"} paddingX={1}>
      <Text color={isDisabled ? "gray" : "cyan"} bold>
        {"› "}
      </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={isDisabled ? "Waiting for response..." : "Type a message..."}
      />
    </Box>
  );
}
