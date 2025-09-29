import { z } from "zod";

// Model thinking capability schema
export const ModelThinkingCapabilitySchema = z.object({
  mode: z.enum(["never", "always_on", "choosable"]),
  control: z
    .object({
      type: z.literal("prompt_prefix"),
      on: z.string(),
      off: z.string(),
    })
    .optional(),
});

// Model capabilities schema
export const ModelCapabilitiesSchema = z.object({
  stream: z.boolean(),
  thinking: ModelThinkingCapabilitySchema,
});

// Current model response schema (excludes sensitive fields like apiKey and providerUrl)
export const CurrentModelResponseSchema = z.object({
  provider: z.string(),
  modelShortName: z.string(),
  modelFullName: z.string(),
  modelUrl: z.string(),
  capabilities: ModelCapabilitiesSchema,
  notes: z.string(),
  enabled: z.boolean(),
});

export type CurrentModelResponse = z.infer<typeof CurrentModelResponseSchema>;
export type ModelThinkingCapability = z.infer<
  typeof ModelThinkingCapabilitySchema
>;
export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;
