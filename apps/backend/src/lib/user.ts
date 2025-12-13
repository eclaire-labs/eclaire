import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { createChildLogger } from "./logger.js";

const { users } = schema;

const logger = createChildLogger("user");

/**
 * Get user profile by user ID
 * @param userId - The ID of the user to fetch
 * @returns The user profile or null if not found
 */
export async function getUserProfile(userId: string) {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      // You can add relations here if needed, e.g., with: { plan: true }
    });

    if (!user) {
      return null;
    }

    // Transform the user object to include avatarUrl instead of avatarStorageId
    const { avatarStorageId, ...userWithoutStorageId } = user;

    return {
      ...userWithoutStorageId,
      avatarUrl: avatarStorageId
        ? `/api/user/${user.id}/avatar?v=${user.updatedAt.getTime()}`
        : null,
    };
  } catch (error) {
    logger.error(
      {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error fetching user profile",
    );
    throw error;
  }
}

/**
 * Get user context for AI prompts
 * @param userId - The ID of the user
 * @returns Object with user context information for AI prompts
 */
export async function getUserContextForPrompt(userId: string) {
  try {
    const user = await getUserProfile(userId);

    if (!user) {
      return {
        displayName: null,
        fullName: null,
        bio: null,
        timezone: null,
        city: null,
        country: null,
      };
    }

    return {
      displayName: user.displayName || null,
      fullName: user.fullName || null,
      bio: user.bio || null,
      timezone: user.timezone || null,
      city: user.city || null,
      country: user.country || null,
    };
  } catch (error) {
    logger.error(
      {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error fetching user context for prompt",
    );
    // Return empty context on error to prevent prompt failures
    return {
      displayName: null,
      fullName: null,
      bio: null,
      timezone: null,
      city: null,
      country: null,
    };
  }
}
