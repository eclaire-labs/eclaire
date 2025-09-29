// components/chat/typing-indicator.tsx
export function TypingIndicator() {
  return (
    <div className="flex items-center space-x-1 p-3">
      <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground" />
    </div>
  );
}
