import z from "zod/v4";

// User profile schema (complete user record)
export const UserProfileSchema = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  fullName: z.string().nullable(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  bio: z.string().nullable(),
  timezone: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),

  createdAt: z.number(),
  updatedAt: z.number(),
});

// User profile update schema (for PATCH /profile)
export const UpdateProfileSchema = z.object({
  displayName: z
    .string()
    .min(2, "Display name must be at least 2 characters.")
    .max(50)
    .optional()
    .or(z.literal("")),
  fullName: z.string().max(100).optional().or(z.literal("")),
  bio: z.string().max(500).optional().or(z.literal("")),
  avatarColor: z.string().optional().or(z.literal("")),
  timezone: z.string().max(50).optional().or(z.literal("")),
  city: z.string().max(50).optional().or(z.literal("")),
  country: z.string().max(50).optional().or(z.literal("")),
});

// User public profile schema (subset of fields for public API responses)
export const PublicUserProfileSchema = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  fullName: z.string().nullable(),
  image: z.string().nullable(),
  bio: z.string().nullable(),
  timezone: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
});

// User context schema for AI prompts
export const UserContextSchema = z.object({
  displayName: z.string().nullable(),
  fullName: z.string().nullable(),
  bio: z.string().nullable(),
  timezone: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
});

// TypeScript types
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;
export type PublicUserProfile = z.infer<typeof PublicUserProfileSchema>;
export type UserContext = z.infer<typeof UserContextSchema>;

// Delete all user data request schema
export const DeleteAllUserDataSchema = z.object({
  password: z.string().min(1, "Password is required for confirmation"),
});

// Add the type export
export type DeleteAllUserData = z.infer<typeof DeleteAllUserDataSchema>;
