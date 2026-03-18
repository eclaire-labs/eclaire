/**
 * Get User Settings Tool
 *
 * Read the current user's profile and settings.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { getUserProfile } from "../../user.js";

const inputSchema = z.object({});

export const getUserSettingsTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "getUserSettings",
  label: "Get User Settings",
  description:
    "Read the current user's profile settings (display name, full name, bio, timezone, city, country, email).",
  inputSchema,
  promptGuidelines: [
    "When the user asks about their profile or personal settings, look up their current values.",
  ],
  execute: async (_callId, _input, ctx) => {
    const profile = await getUserProfile(ctx.userId);
    if (!profile) {
      return errorResult("User profile not found");
    }

    const settings = {
      displayName: profile.displayName,
      fullName: profile.fullName,
      email: profile.email,
      bio: profile.bio,
      timezone: profile.timezone,
      city: profile.city,
      country: profile.country,
    };

    return textResult(JSON.stringify(settings, null, 2));
  },
};
