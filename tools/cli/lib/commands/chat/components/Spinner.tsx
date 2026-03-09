import { Text } from "ink";
import InkSpinner from "ink-spinner";

interface SpinnerProps {
  label: string;
  color?: string;
}

export function Spinner({ label, color = "cyan" }: SpinnerProps) {
  return (
    <Text>
      <Text color={color}>
        <InkSpinner type="dots" />
      </Text>
      <Text dimColor> {label}</Text>
    </Text>
  );
}
