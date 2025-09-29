// schemas/prompt-responses.ts
import { z } from "zod";
import { TraceSchema } from "./prompt-params";

// Tool call summary schema for user visibility
export const ToolCallSummarySchema = z.object({
  functionName: z.string(),
  executionTimeMs: z.number(),
  success: z.boolean(),
  error: z.string().optional(),
  // Arguments and results are optional and may be sanitized for privacy
  arguments: z.record(z.any()).optional(),
  resultSummary: z.string().optional(), // Human-readable summary of the result
});

// Base response schema
export const BasePromptResponseSchema = z.object({
  status: z.string(),
  requestId: z.string(),
});

// Text response schema (most common AI response)
export const TextPromptResponseSchema = BasePromptResponseSchema.extend({
  type: z.literal("text_response"),
  response: z.string(),
  thinkingContent: z.string().optional(),
  conversationId: z.string().optional(),
  toolCalls: z.array(ToolCallSummarySchema).optional(),
  trace: TraceSchema.optional(),
});

// Image response schema (for AI-generated images)
export const ImagePromptResponseSchema = BasePromptResponseSchema.extend({
  type: z.literal("image_response"),
  imageUrl: z.string(),
  description: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// Error response with AI processing details
export const AIErrorResponseSchema = z.object({
  type: z.literal("text_response"),
  error: z.string(),
  response: z.string(),
});

// Tool execution error schema
export const ToolExecutionErrorSchema = z.object({
  tool_name: z.string(),
  error: z.string(),
  result: z.null(),
});

// AI configuration error schema
export const AIConfigErrorSchema = z.object({
  error: z.string().default("Configuration error"),
  message: z.string().default("AI service is not properly configured."),
});

// Content size error schema
export const ContentSizeErrorSchema = z.object({
  error: z.string().default("Content too large"),
  message: z
    .string()
    .default("The content data exceeds the maximum size limit of 10MB"),
});

// Invalid request error schema
export const InvalidRequestErrorSchema = z.object({
  error: z.string().default("Invalid request"),
  message: z
    .string()
    .default("Request must include either 'prompt' or 'content' or both"),
});

// Request validation error schema
export const RequestValidationErrorSchema = z.object({
  error: z.string().default("Invalid request format"),
  message: z.string().default("Request body validation failed"),
  details: z.array(
    z.object({
      code: z.string(),
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string(),
    }),
  ),
});

// AI API error schema (when external AI service fails)
export const AIAPIErrorSchema = z.object({
  error: z.string().default("AI processing error"),
  message: z.string(),
  status: z.number().optional(),
  statusText: z.string().optional(),
});

// General server error response
export const GeneralErrorResponseSchema = z.object({
  type: z.literal("text_response"),
  error: z.string().default("Internal server error"),
  response: z
    .string()
    .default(
      "An unexpected error occurred while processing your request. Please try again later.",
    ),
});

// Union type for all possible prompt responses
export const PromptResponseSchema = z.union([
  TextPromptResponseSchema,
  ImagePromptResponseSchema,
  AIErrorResponseSchema,
  GeneralErrorResponseSchema,
]);

// TypeScript types
export type BasePromptResponse = z.infer<typeof BasePromptResponseSchema>;
export type ToolCallSummary = z.infer<typeof ToolCallSummarySchema>;
export type TextPromptResponse = z.infer<typeof TextPromptResponseSchema>;
export type ImagePromptResponse = z.infer<typeof ImagePromptResponseSchema>;
export type AIErrorResponse = z.infer<typeof AIErrorResponseSchema>;
export type ToolExecutionError = z.infer<typeof ToolExecutionErrorSchema>;
export type AIConfigError = z.infer<typeof AIConfigErrorSchema>;
export type ContentSizeError = z.infer<typeof ContentSizeErrorSchema>;
export type InvalidRequestError = z.infer<typeof InvalidRequestErrorSchema>;
export type RequestValidationError = z.infer<
  typeof RequestValidationErrorSchema
>;
export type AIAPIError = z.infer<typeof AIAPIErrorSchema>;
export type GeneralErrorResponse = z.infer<typeof GeneralErrorResponseSchema>;
export type PromptResponse = z.infer<typeof PromptResponseSchema>;
