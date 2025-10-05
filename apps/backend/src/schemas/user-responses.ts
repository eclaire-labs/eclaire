import z from "zod/v4";

// Full user profile response (for authenticated user)
export const UserProfileResponseSchema = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  fullName: z.string().nullable(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  bio: z.string().nullable(),
  timezone: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

// Public user profile response (for public API endpoints)
export const PublicUserProfileResponseSchema = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  fullName: z.string().nullable(),
  image: z.string().nullable(),
  bio: z.string().nullable(),
  timezone: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
});

// Profile update response
export const ProfileUpdateResponseSchema = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  fullName: z.string().nullable(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  bio: z.string().nullable(),
  timezone: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  message: z.string().optional(),
});

// User context response for AI prompts
export const UserContextResponseSchema = z.object({
  displayName: z.string().nullable(),
  fullName: z.string().nullable(),
  bio: z.string().nullable(),
  timezone: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
});

// Error responses specific to user operations
export const UserNotFoundSchema = z.object({
  error: z.string().default("User not found"),
});

export const UserUpdateFailedSchema = z.object({
  error: z.string().default("User profile update failed"),
});

export const UserProfileValidationErrorSchema = z.object({
  error: z.string().default("Invalid profile data"),
  details: z.array(
    z.object({
      code: z.string(),
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string(),
    }),
  ),
});

// TypeScript types
export type UserProfileResponse = z.infer<typeof UserProfileResponseSchema>;
export type PublicUserProfileResponse = z.infer<
  typeof PublicUserProfileResponseSchema
>;
export type ProfileUpdateResponse = z.infer<typeof ProfileUpdateResponseSchema>;
export type UserContextResponse = z.infer<typeof UserContextResponseSchema>;
export type UserNotFound = z.infer<typeof UserNotFoundSchema>;
export type UserUpdateFailed = z.infer<typeof UserUpdateFailedSchema>;
export type UserProfileValidationError = z.infer<
  typeof UserProfileValidationErrorSchema
>;

// Delete all user data response schema
export const DeleteAllUserDataResponseSchema = z.object({
  message: z.string(),
  accountKept: z.boolean(),
});

// Add the type export
export type DeleteAllUserDataResponse = z.infer<
  typeof DeleteAllUserDataResponseSchema
>;
