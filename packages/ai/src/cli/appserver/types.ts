/**
 * Codex App-Server Types
 *
 * JSON-RPC message types and notification shapes for the
 * `codex app-server` protocol over stdio.
 */

// =============================================================================
// JSON-RPC 2.0 BASE TYPES
// =============================================================================

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcNotification {
  jsonrpc?: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcResponse;

// =============================================================================
// APP-SERVER INITIALIZE TYPES
// =============================================================================

export interface InitializeParams {
  clientInfo: {
    name: string;
    title?: string;
    version: string;
  };
  capabilities?: {
    experimentalApi?: boolean;
  };
}

export interface InitializeResult {
  serverInfo?: {
    name?: string;
    version?: string;
  };
  capabilities?: Record<string, unknown>;
}

// =============================================================================
// APP-SERVER THREAD/TURN TYPES
// =============================================================================

export interface ThreadStartParams {
  [key: string]: unknown;
}

export interface ThreadStartResult {
  threadId: string;
}

export interface ThreadResumeParams {
  threadId: string;
}

export interface ThreadResumeResult {
  threadId: string;
}

export interface TurnStartParams {
  threadId: string;
  input: Array<{ type: "text"; text: string }>;
}

// =============================================================================
// APP-SERVER NOTIFICATION PARAMS
// =============================================================================

export interface ItemStartedParams {
  threadId: string;
  item: AppServerItem;
}

export interface ItemDeltaParams {
  threadId: string;
  itemId: string;
  delta: string;
}

export interface ItemCompletedParams {
  threadId: string;
  item: AppServerItem;
}

export interface TurnCompletedParams {
  threadId: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cached_input_tokens?: number;
  };
}

export interface TurnFailedParams {
  threadId: string;
  error: {
    message: string;
    code?: number;
  };
}

export interface ApprovalRequestedParams {
  threadId: string;
  itemId: string;
  type: string;
  description?: string;
  command?: string;
  changes?: Array<{ path: string; kind: string }>;
}

// =============================================================================
// APP-SERVER ITEM TYPES
// =============================================================================

export interface AppServerItem {
  id: string;
  type: string;
  text?: string;
  command?: string;
  aggregated_output?: string;
  exit_code?: number | null;
  status?: string;
  server?: string;
  tool?: string;
  arguments?: unknown;
  changes?: Array<{ path: string; kind: string }>;
  [key: string]: unknown;
}

// =============================================================================
// TRANSPORT CALLBACK TYPE
// =============================================================================

export type NotificationHandler = (
  method: string,
  params: Record<string, unknown>,
) => void;

export type ServerRequestHandler = (
  method: string,
  params: Record<string, unknown>,
  id: number,
) => void;
