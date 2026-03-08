export interface DisplayOptions {
  showThinking: boolean;
  showTools: boolean;
  verbose: boolean;
}

export interface ToolCallInfo {
  name: string;
  status: "starting" | "executing" | "completed" | "error";
  arguments?: Record<string, unknown>;
  result?: string;
  error?: string;
}

export interface DisplayMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  thinking?: string;
  toolCall?: ToolCallInfo;
}
