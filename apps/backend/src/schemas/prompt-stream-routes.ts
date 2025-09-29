// schemas/prompt-stream-routes.ts
import { resolver } from "hono-openapi/zod";
import {
  ErrorResponseSchema,
  UnauthorizedSchema,
  ValidationErrorSchema,
} from "./all-responses";
import {
  AIAPIErrorSchema,
  AIConfigErrorSchema,
  ContentSizeErrorSchema,
  InvalidRequestErrorSchema,
  RequestValidationErrorSchema,
} from "./prompt-responses";
import { StreamPromptRequestSchema } from "./prompt-stream-params";

// POST /api/prompt/stream - Process AI prompt requests with streaming
export const postPromptStreamRouteDescription = {
  tags: ["AI & Prompts"],
  summary: "Process AI prompt request with streaming response",
  description:
    "Submit a prompt to the AI assistant with real-time streaming response. Supports Server-Sent Events (SSE) for live updates including AI thinking process, tool executions, and text chunks as they become available.",
  requestBody: {
    description: "AI prompt request for streaming response",
    content: {
      "application/json": {
        schema: resolver(StreamPromptRequestSchema) as any,
      },
    },
    required: true,
  },
  responses: {
    200: {
      description: "Streaming AI response (text/event-stream)",
      content: {
        "text/event-stream": {
          schema: {
            type: "string" as const,
            description: "Server-Sent Events stream with JSON event data",
            example:
              'data: {"type": "thought", "content": "Analyzing the request..."}\n\n' +
              'data: {"type": "tool-call", "name": "findNotes", "status": "executing"}\n\n' +
              'data: {"type": "text-chunk", "content": "Based on your notes..."}\n\n' +
              'data: {"type": "done", "requestId": "req-123", "conversationId": "conv-456"}\n\n',
          },
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(RequestValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    413: {
      description: "Content too large (max 10MB)",
      content: {
        "application/json": {
          schema: resolver(ContentSizeErrorSchema),
        },
      },
    },
    500: {
      description: "AI configuration error",
      content: {
        "application/json": {
          schema: resolver(AIConfigErrorSchema),
        },
      },
    },
    502: {
      description: "AI service error",
      content: {
        "application/json": {
          schema: resolver(AIAPIErrorSchema),
        },
      },
    },
  },
};
