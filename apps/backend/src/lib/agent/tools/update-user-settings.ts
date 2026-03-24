/**
 * Update User Settings Tool
 *
 * Update the current user's profile settings.
 */

import { textResult, type RuntimeToolDefinition } from "@eclaire/ai";
import z from "zod/v4";
import { updateUserProfile } from "../../services/user-data.js";

const inputSchema = z.object({
  displayName: z
    .string()
    .min(2)
    .max(50)
    .optional()
    .describe("New display name"),
  fullName: z.string().max(100).optional().describe("New full name"),
  bio: z.string().max(500).optional().describe("New bio/description"),
  timezone: z
    .string()
    .max(50)
    .optional()
    .describe("New timezone (e.g., 'America/New_York', 'Europe/Paris')"),
  city: z.string().max(50).optional().describe("New city"),
  country: z.string().max(50).optional().describe("New country"),
});

export const updateUserSettingsTool: RuntimeToolDefinition<typeof inputSchema> =
  {
    name: "updateUserSettings",
    label: "Update User Settings",
    description:
      "Update the current user's profile settings (display name, full name, bio, timezone, city, country).",
    accessLevel: "write",
    inputSchema,
    promptGuidelines: [
      "Always confirm with the user before changing their settings.",
      "Show both current and proposed values before making changes.",
    ],
    execute: async (_callId, input, ctx) => {
      const updateData: Record<string, unknown> = {};
      if (input.displayName !== undefined)
        updateData.displayName = input.displayName;
      if (input.fullName !== undefined) updateData.fullName = input.fullName;
      if (input.bio !== undefined) updateData.bio = input.bio;
      if (input.timezone !== undefined) updateData.timezone = input.timezone;
      if (input.city !== undefined) updateData.city = input.city;
      if (input.country !== undefined) updateData.country = input.country;

      const updated = await updateUserProfile(ctx.userId, updateData);

      const result = {
        displayName: updated.displayName,
        fullName: updated.fullName,
        bio: updated.bio,
        timezone: updated.timezone,
        city: updated.city,
        country: updated.country,
      };

      return textResult(JSON.stringify(result, null, 2));
    },
  };
