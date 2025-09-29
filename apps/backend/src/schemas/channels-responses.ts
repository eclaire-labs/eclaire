import { z } from "zod";
import {
  ChannelCapabilitySchema,
  ChannelPlatformSchema,
} from "./channels-params";

// Channel response schema (config is not included for security)
export const ChannelResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  platform: ChannelPlatformSchema,
  capability: ChannelCapabilitySchema,
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Note: config is intentionally excluded from responses for security
});

// List channels response
export const ListChannelsResponseSchema = z.object({
  channels: z.array(ChannelResponseSchema),
  total: z.number(),
});

// Create channel response
export const CreateChannelResponseSchema = z.object({
  channel: ChannelResponseSchema,
  message: z.string(),
});

// Update channel response
export const UpdateChannelResponseSchema = z.object({
  channel: ChannelResponseSchema,
  message: z.string(),
});

// Delete channel response
export const DeleteChannelResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

// Send notification response
export const SendNotificationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  results: z.array(
    z.object({
      channelId: z.string(),
      channelName: z.string(),
      platform: ChannelPlatformSchema,
      success: z.boolean(),
      error: z.string().optional(),
    }),
  ),
  totalChannels: z.number(),
  successfulChannels: z.number(),
  failedChannels: z.number(),
});

// Error response schema
export const ChannelErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.any().optional(),
});

// Channel not found response schema
export const ChannelNotFoundSchema = z
  .object({
    error: z.string(),
    message: z.string(),
  })
  .openapi({
    ref: "ChannelNotFound",
    description: "Channel not found error response",
  });

export type ChannelResponse = z.infer<typeof ChannelResponseSchema>;
export type ListChannelsResponse = z.infer<typeof ListChannelsResponseSchema>;
export type CreateChannelResponse = z.infer<typeof CreateChannelResponseSchema>;
export type UpdateChannelResponse = z.infer<typeof UpdateChannelResponseSchema>;
export type DeleteChannelResponse = z.infer<typeof DeleteChannelResponseSchema>;
export type SendNotificationResponse = z.infer<
  typeof SendNotificationResponseSchema
>;
export type ChannelErrorResponse = z.infer<typeof ChannelErrorResponseSchema>;
export type ChannelNotFound = z.infer<typeof ChannelNotFoundSchema>;
