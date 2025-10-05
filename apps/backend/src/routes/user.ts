import { and, eq } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { validator as zValidator } from "hono-openapi/zod";
import path from "path";
import sharp from "sharp";
import { db } from "@/db";
import { apiKeys, users } from "@/db/schema";
import {
  formatApiKeyForDisplay,
  generateFullApiKey,
} from "@/lib/api-key-security";
import { getAuthenticatedUserId } from "@/lib/auth-utils";
import {
  deleteAllUserData,
  getActivityTimeline,
  getDashboardStatistics,
  getDueItems,
  getQuickStats,
  getUserDataSummary,
} from "@/lib/services/user-data";
import { objectStorage } from "@/lib/storage";
import { getUserProfile } from "@/lib/user";
// Import schemas
import {
  DeleteAllUserDataSchema,
  UpdateProfileSchema,
} from "@/schemas/user-params";
// Import route descriptions
import {
  deleteAllUserDataRouteDescription,
  getPublicUserProfileRouteDescription,
  getUserDashboardStatsRouteDescription,
  getUserProfileRouteDescription,
  updateUserProfileRouteDescription,
} from "@/schemas/user-routes";
import type { RouteVariables } from "@/types/route-variables";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("user");

export const userRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/user - Get the current authenticated user's complete profile
userRoutes.get(
  "/",
  describeRoute(getUserProfileRouteDescription),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const user = await getUserProfile(userId);

      if (!user) {
        return c.json({ error: "User not found" }, 404);
      }

      // Fetch all assistant users from database
      const assistantUsers = await db.query.users.findMany({
        where: eq(users.userType, "assistant"),
        columns: {
          id: true,
          displayName: true,
          userType: true,
          email: true,
        },
      });

      // Prepare available assignees (current user + all assistant users)
      const availableAssignees = [
        // Current user
        {
          id: user.id,
          displayName: user.displayName || user.email || user.id,
          userType: user.userType,
          email: user.email,
        },
        // All assistant users from database
        ...assistantUsers.map((assistant) => ({
          id: assistant.id,
          displayName: assistant.displayName || "AI Assistant",
          userType: assistant.userType,
          email: assistant.email,
        })),
      ];

      return c.json({
        user,
        availableAssignees,
      });
    } catch (error) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          userId: c.get("user")?.id,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error fetching user profile",
      );
      return c.json({ error: "Failed to fetch user profile" }, 500);
    }
  },
);

// PATCH /api/user/profile - Update the user's profile
userRoutes.patch(
  "/profile",
  describeRoute(updateUserProfileRouteDescription),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const body = await c.req.json();
      const validationResult = UpdateProfileSchema.safeParse(body);

      if (!validationResult.success) {
        return c.json(
          {
            error: "Invalid data",
            details: validationResult.error.errors,
          },
          400,
        );
      }

      const validatedData = validationResult.data;

      const [updatedUser] = await db
        .update(users)
        // PostgreSQL expects a Date object for timestamp fields
        .set({ ...validatedData, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        return c.json({ error: "User not found or update failed" }, 404);
      }

      return c.json(updatedUser);
    } catch (error) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          userId: c.get("user")?.id,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error updating profile",
      );
      return c.json({ error: "Failed to update profile" }, 500);
    }
  },
);

// POST /api/user/delete-all-data - Delete all user data while keeping account
userRoutes.post(
  "/delete-all-data",
  describeRoute(deleteAllUserDataRouteDescription),
  zValidator("json", DeleteAllUserDataSchema),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { password } = c.req.valid("json");

      if (!password) {
        return c.json({ error: "Password is required for confirmation" }, 400);
      }

      await deleteAllUserData(userId, password);

      logger.info(
        {
          requestId: c.get("requestId"),
          userId,
        },
        "All user data deleted successfully",
      );

      return c.json({
        message:
          "All user data deleted successfully. Your account remains active.",
        accountKept: true,
      });
    } catch (error: unknown) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error deleting all user data",
      );

      if (error instanceof Error) {
        if (error.message === "User not found") {
          return c.json({ error: "User not found" }, 404);
        }
        if (error.message === "Invalid password") {
          return c.json({ error: "Invalid password provided" }, 400);
        }
      }

      return c.json({ error: "Failed to delete user data" }, 500);
    }
  },
);

// GET /api/user/api-keys - Get all user's API keys
userRoutes.get("/api-keys", async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const keys = await db.query.apiKeys.findMany({
      where: and(eq(apiKeys.userId, userId), eq(apiKeys.isActive, true)),
      columns: {
        id: true,
        keyId: true,
        keySuffix: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: (apiKeys, { desc }) => [desc(apiKeys.createdAt)],
    });

    return c.json({
      apiKeys: keys.map((k) => ({
        id: k.id,
        displayKey: formatApiKeyForDisplay(k.keyId, k.keySuffix),
        name: k.name,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      })),
    });
  } catch (error) {
    const requestId = c.get("requestId");
    logger.error(
      {
        requestId,
        userId: c.get("user")?.id,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error fetching API keys",
    );
    return c.json({ error: "Failed to fetch API keys" }, 500);
  }
});

// POST /api/user/api-keys - Create a new API key
userRoutes.post("/api-keys", async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const name =
      body.name || `API Key ${new Date().toISOString().split("T")[0]}`;

    const { fullKey, keyId, hash, hashVersion, suffix } = generateFullApiKey();

    const result = await db
      .insert(apiKeys)
      .values({
        keyId,
        keyHash: hash,
        hashVersion,
        keySuffix: suffix,
        name,
        userId,
      })
      .returning({
        id: apiKeys.id,
        keyId: apiKeys.keyId,
        keySuffix: apiKeys.keySuffix,
        name: apiKeys.name,
        createdAt: apiKeys.createdAt,
      });

    const createdKey = result[0];
    if (!createdKey) {
      throw new Error("Failed to create API key");
    }

    return c.json({
      apiKey: {
        id: createdKey.id,
        key: fullKey, // Only time we return the full key!
        displayKey: formatApiKeyForDisplay(
          createdKey.keyId,
          createdKey.keySuffix,
        ),
        name: createdKey.name,
        createdAt: createdKey.createdAt,
        lastUsedAt: null,
      },
    });
  } catch (error) {
    const requestId = c.get("requestId");
    logger.error(
      {
        requestId,
        userId: c.get("user")?.id,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error creating API key",
    );
    return c.json({ error: "Failed to create API key" }, 500);
  }
});

// DELETE /api/user/api-keys/:id - Delete a specific API key
userRoutes.delete("/api-keys/:id", async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const keyId = c.req.param("id");

    const result = await db
      .update(apiKeys)
      .set({ isActive: false })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
      .returning({ id: apiKeys.id });

    if (result.length === 0) {
      return c.json({ error: "API key not found" }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    const requestId = c.get("requestId");
    logger.error(
      {
        requestId,
        userId: c.get("user")?.id,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error deleting API key",
    );
    return c.json({ error: "Failed to delete API key" }, 500);
  }
});

// PATCH /api/user/api-keys/:id - Update API key name
userRoutes.patch("/api-keys/:id", async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const keyId = c.req.param("id");
    const body = await c.req.json();

    if (!body.name || typeof body.name !== "string") {
      return c.json({ error: "Name is required" }, 400);
    }

    const [updatedKey] = await db
      .update(apiKeys)
      .set({ name: body.name })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
      .returning({
        id: apiKeys.id,
        keyId: apiKeys.keyId,
        keySuffix: apiKeys.keySuffix,
        name: apiKeys.name,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
      });

    if (!updatedKey) {
      return c.json({ error: "API key not found" }, 404);
    }

    return c.json({
      apiKey: {
        id: updatedKey.id,
        displayKey: formatApiKeyForDisplay(
          updatedKey.keyId,
          updatedKey.keySuffix,
        ),
        name: updatedKey.name,
        createdAt: updatedKey.createdAt,
        lastUsedAt: updatedKey.lastUsedAt,
      },
    });
  } catch (error) {
    const requestId = c.get("requestId");
    logger.error(
      {
        requestId,
        userId: c.get("user")?.id,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error updating API key",
    );
    return c.json({ error: "Failed to update API key" }, 500);
  }
});

// GET /api/user/dashboard-stats - Get dashboard statistics
userRoutes.get(
  "/dashboard-stats",
  describeRoute(getUserDashboardStatsRouteDescription),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const stats = await getDashboardStatistics(userId);

      logger.info(
        {
          requestId: c.get("requestId"),
          userId,
          totalAssets: stats.assets.total.count,
          totalStorage: stats.assets.total.storageSizeFormatted,
        },
        "Dashboard statistics retrieved",
      );

      return c.json(stats);
    } catch (error: unknown) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error getting dashboard statistics",
      );
      return c.json({ error: "Failed to get dashboard statistics" }, 500);
    }
  },
);

// POST /api/user/avatar - Upload user avatar
userRoutes.post("/avatar", async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const formData = await c.req.formData();
    const avatarFile = formData.get("avatar") as File;

    if (!avatarFile) {
      return c.json({ error: "Avatar file is required" }, 400);
    }

    // Validate file type
    const contentBuffer = Buffer.from(await avatarFile.arrayBuffer());
    const fileTypeResult = await fileTypeFromBuffer(contentBuffer);
    const verifiedMimeType = fileTypeResult?.mime || avatarFile.type;

    if (!verifiedMimeType.startsWith("image/")) {
      return c.json({ error: "File must be an image" }, 400);
    }

    // Process image - resize to standard avatar sizes
    const processedBuffer = await sharp(contentBuffer)
      .resize(256, 256, {
        fit: "cover",
        position: "center",
      })
      .jpeg({ quality: 90 })
      .toBuffer();

    // Store the processed image directly in user root directory
    const avatarPath = path.join(userId, "avatar.jpg");
    await objectStorage.saveBuffer(processedBuffer, avatarPath);
    const storageResult = { storageId: avatarPath };

    // Update user with new avatar storage ID
    const [updatedUser] = await db
      .update(users)
      .set({
        avatarStorageId: storageResult.storageId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      return c.json({ error: "Failed to update user avatar" }, 500);
    }

    return c.json({
      message: "Avatar uploaded successfully",
      avatarUrl: `/api/user/${userId}/avatar`,
    });
  } catch (error) {
    const requestId = c.get("requestId");
    logger.error(
      {
        requestId,
        userId: await getAuthenticatedUserId(c),
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error uploading avatar",
    );
    return c.json({ error: "Failed to upload avatar" }, 500);
  }
});

// DELETE /api/user/avatar - Remove user avatar
userRoutes.delete("/avatar", async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Get current user to check if avatar exists
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        avatarStorageId: true,
      },
    });

    if (!user?.avatarStorageId) {
      return c.json({ error: "No avatar to remove" }, 404);
    }

    // Delete avatar file from storage
    try {
      await objectStorage.delete(user.avatarStorageId);
    } catch (error) {
      // Log but don't fail if file doesn't exist
      logger.warn(
        { userId, storageId: user.avatarStorageId },
        "Avatar file not found in storage during deletion",
      );
    }

    // Clear avatar from user record
    const [updatedUser] = await db
      .update(users)
      .set({
        avatarStorageId: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      return c.json({ error: "Failed to update user record" }, 500);
    }

    logger.info(
      { requestId: c.get("requestId"), userId },
      "Avatar removed successfully",
    );

    return c.json({
      message: "Avatar removed successfully",
    });
  } catch (error) {
    const requestId = c.get("requestId");
    logger.error(
      {
        requestId,
        userId: await getAuthenticatedUserId(c),
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error removing avatar",
    );
    return c.json({ error: "Failed to remove avatar" }, 500);
  }
});

// GET /api/user/activity-timeline - Get activity timeline for dashboard
userRoutes.get("/activity-timeline", async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Get days parameter from query, default to 30
    const daysParam = c.req.query("days");
    const days = daysParam ? parseInt(daysParam, 10) : 30;

    // Validate days parameter
    if (isNaN(days) || days < 1 || days > 365) {
      return c.json(
        { error: "Invalid days parameter. Must be between 1 and 365." },
        400,
      );
    }

    const timeline = await getActivityTimeline(userId, days);

    logger.info(
      {
        requestId: c.get("requestId"),
        userId,
        days,
        timelineLength: timeline.length,
      },
      "Activity timeline retrieved",
    );

    return c.json(timeline);
  } catch (error: unknown) {
    const requestId = c.get("requestId");
    logger.error(
      {
        requestId,
        userId: await getAuthenticatedUserId(c),
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error getting activity timeline",
    );
    return c.json({ error: "Failed to get activity timeline" }, 500);
  }
});

// GET /api/user/due-items - Get items due soon for dashboard
userRoutes.get("/due-items", async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c);

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const dueItems = await getDueItems(userId);

    logger.info(
      {
        requestId: c.get("requestId"),
        userId,
        overdue: dueItems.overdue.length,
        dueToday: dueItems.dueToday.length,
        dueThisWeek: dueItems.dueThisWeek.length,
      },
      "Due items retrieved",
    );

    return c.json(dueItems);
  } catch (error: unknown) {
    const requestId = c.get("requestId");
    logger.error(
      {
        requestId,
        userId: await getAuthenticatedUserId(c),
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error getting due items",
    );
    return c.json({ error: "Failed to get due items" }, 500);
  }
});

// GET /api/user/quick-stats - Get quick stats for dashboard widgets
userRoutes.get("/quick-stats", async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const stats = await getQuickStats(userId);

    logger.info(
      {
        requestId: c.get("requestId"),
        userId,
        pinnedTotal: stats.pinned.total,
        pendingTotal: stats.pendingReview.total,
        flaggedTotal: stats.flagged.total,
        processing: stats.processing,
      },
      "Quick stats retrieved",
    );

    return c.json(stats);
  } catch (error: unknown) {
    const requestId = c.get("requestId");
    logger.error(
      {
        requestId,
        userId: await getAuthenticatedUserId(c),
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error getting quick stats",
    );
    return c.json({ error: "Failed to get quick stats" }, 500);
  }
});

// GET /api/user/:userId - Get user information by ID (for workers/AI assistants)
userRoutes.get(
  "/:userId",
  describeRoute(getPublicUserProfileRouteDescription),
  async (c) => {
    try {
      const userId = c.req.param("userId");
      const requestingUserId = await getAuthenticatedUserId(c);

      if (!requestingUserId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Look up the requested user
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: {
          id: true,
          userType: true,
          displayName: true,
          email: true,
        },
      });

      if (!user) {
        return c.json({ error: "User not found" }, 404);
      }

      return c.json({
        id: user.id,
        userType: user.userType,
        displayName: user.displayName || "Unknown User",
        email: user.email,
      });
    } catch (error) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          userId: c.req.param("userId"),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error fetching user by ID",
      );
      return c.json({ error: "Failed to fetch user" }, 500);
    }
  },
);

// GET /api/user/:userId/avatar - Serve user avatar
userRoutes.get("/:userId/avatar", async (c) => {
  try {
    const userId = c.req.param("userId");

    if (!userId) {
      return c.json({ error: "User ID is required" }, 400);
    }

    // Get user's avatar storage ID
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        avatarStorageId: true,
      },
    });

    if (!user?.avatarStorageId) {
      return c.json({ error: "Avatar not found" }, 404);
    }

    // Get avatar from storage
    const { stream, contentLength } = await objectStorage.getStream(
      user.avatarStorageId,
    );

    // Set appropriate headers
    const headers = new Headers();
    headers.set("Content-Type", "image/jpeg");
    if (contentLength !== undefined) {
      headers.set("Content-Length", String(contentLength));
    }
    headers.set("Cache-Control", "public, max-age=86400"); // Cache for 24 hours

    return new Response(stream as any, { status: 200, headers });
  } catch (error) {
    const requestId = c.get("requestId");
    return c.json({ error: "Failed to serve avatar" }, 500);
  }
});
