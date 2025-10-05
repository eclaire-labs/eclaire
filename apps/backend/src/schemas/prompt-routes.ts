import { resolver } from "hono-openapi";
import {
  ErrorResponseSchema,
  UnauthorizedSchema,
  ValidationErrorSchema,
} from "./all-responses";
import {
  ContentDataSchema,
  DeviceInfoSchema,
  PromptRequestSchema,
} from "./prompt-params";
import {
  AIAPIErrorSchema,
  AIConfigErrorSchema,
  ContentSizeErrorSchema,
  GeneralErrorResponseSchema,
  ImagePromptResponseSchema,
  InvalidRequestErrorSchema,
  RequestValidationErrorSchema,
  TextPromptResponseSchema,
} from "./prompt-responses";

// POST /api/prompt - Process AI prompt requests
export const postPromptRouteDescription = {
  tags: ["AI & Prompts"],
  summary: "Process AI prompt request",
  description:
    "Submit a prompt to the AI assistant with optional content (files, images, etc.) and device context. The AI can search through your personal knowledge base (notes, bookmarks, documents, photos, tasks) and provide intelligent responses.",
  requestBody: {
    description: "AI prompt request with optional content and device context",
    content: {
      "application/json": {
        schema: resolver(PromptRequestSchema) as any,
      },
    },
    required: true,
  },
  responses: {
    200: {
      description: "AI response generated successfully",
      content: {
        "application/json": {
          schema: resolver(TextPromptResponseSchema),
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
