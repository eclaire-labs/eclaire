// schemas/prompt-params.ts
import z from "zod/v4";
import { jsonValueSchema, toolArgumentsSchema } from "./common.js";

// Content data schema for file/data uploads
export const ContentDataSchema = z.object({
  data: z.string(),
  fileName: z.string().optional(),
  fileExt: z.string().optional(),
  type: z.string(),
});

// Device information schema for context
export const DeviceInfoSchema = z.object({
  systemBuild: z.string().optional(),
  hostName: z.string().optional(),
  isWatch: z.string().optional(),
  deviceName: z.string().optional(),
  systemVersion: z.string().optional(),
  screenHeight: z.string().optional(),
  appearance: z.string().optional(),
  dateTime: z.string().optional(),
  timeZone: z.string().optional(),
  app: z
    .object({
      name: z.string().optional(),
      version: z.string().optional(),
    })
    .optional(),
  model: z.string().optional(),
  screenWidth: z.string().optional(),
});

// Asset reference schema for context
export const AssetReferenceSchema = z.object({
  type: z.enum(["note", "bookmark", "document", "photo", "task"]),
  id: z.string(),
});

// Context schema for pre-selected assets and agent specification
export const ContextSchema = z.object({
  assets: z.array(AssetReferenceSchema).optional(),
  agent: z.string().default("eclaire"), // Default to eclaire agent
  backgroundTaskExecution: z.boolean().optional(), // Flag for background task execution
});

// Main prompt request schema
export const PromptRequestSchema = z.object({
  content: z.union([ContentDataSchema, z.array(ContentDataSchema)]).optional(),
  deviceInfo: DeviceInfoSchema.optional(),
  prompt: z.string().optional(),
  context: ContextSchema.optional(),
  conversationId: z.string().optional(),
  targetUserId: z.string().optional(),
  stream: z.boolean().optional().default(false),
  enableThinking: z.boolean().optional(),
});

// Tool call schema for AI function calls
export const ToolCallSchema = z.object({
  functionName: z.string(),
  arguments: toolArgumentsSchema,
});

// Tool result schema
export const ToolResultSchema = z.object({
  tool_name: z.string(),
  result: jsonValueSchema.optional(),
  error: z.string().optional(),
});

// AI message schema
export const AIMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

// User context schema for AI prompts (from user service)
export const UserContextSchema = z.object({
  displayName: z.string().nullable(),
  fullName: z.string().nullable(),
  bio: z.string().nullable(),
  timezone: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
});

// Validation schemas for tool call arguments
export const SearchArgsSchema = z.object({
  text: z.string().optional(),
  tags: z.array(z.string()).optional(),
  startDate: z.string().optional(), // ISO date string
  endDate: z.string().optional(), // ISO date string
  limit: z.number().min(1).max(100).optional(),
  fileTypes: z.array(z.string()).optional(), // For documents
  locationCity: z.string().optional(), // For photos
  dateField: z.enum(["created_at", "dateTaken"]).optional(), // For photos
  status: z.enum(["not-started", "in-progress", "completed"]).optional(), // For tasks
});

// TypeScript types
export type ContentData = z.infer<typeof ContentDataSchema>;
export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;
export type PromptRequest = z.infer<typeof PromptRequestSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;
export type AIMessage = z.infer<typeof AIMessageSchema>;
export type UserContext = z.infer<typeof UserContextSchema>;
export type SearchArgs = z.infer<typeof SearchArgsSchema>;
export type AssetReference = z.infer<typeof AssetReferenceSchema>;
export type Context = z.infer<typeof ContextSchema>;
