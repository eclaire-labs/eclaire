import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { validator as zValidator } from "hono-openapi";
import { getAuthenticatedUserId } from "../lib/auth-utils.js";
import {
  // Dashboard & data functions (already delegated)
  deleteAllUserData,
  getActivityTimeline,
  getDashboardStatistics,
  getDueItems,
  getQuickStats,
  // New service functions
  getUserWithAssignees,
  updateUserProfile,
  getPublicUserProfile,
  getUserApiKeys,
  createApiKey,
  deleteApiKey,
  updateApiKeyName,
  uploadUserAvatar,
  deleteUserAvatar,
  getUserAvatar,
  // Error classes
  UserNotFoundError,
  ApiKeyNotFoundError,
  AvatarNotFoundError,
  InvalidImageError,
} from "../lib/services/user-data.js";
// Import schemas
import {
  DeleteAllUserDataSchema,
  UpdateProfileSchema,
} from "../schemas/user-params.js";
// Import route descriptions
import {
  deleteAllUserDataRouteDescription,
  getPublicUserProfileRouteDescription,
  getUserDashboardStatsRouteDescription,
  getUserProfileRouteDescription,
  updateUserProfileRouteDescription,
} from "../schemas/user-routes.js";
import type { RouteVariables } from "../types/route-variables.js";
import { createChildLogger } from "../lib/logger.js";

const logger = createChildLogger("user");

export const userRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/user - Get the current authenticated user's complete profile
userRoutes.get(
  "/",
  describeRoute(getUserProfileRouteDescription),
  async (c) => {
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const result = await getUserWithAssignees(userId);
      return c.json(result);
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        return c.json({ error: "User not found" }, 404);
      }
      logger.error(
        {
          requestId: c.get("requestId"),
          userId,
          error: error instanceof Error ? error.message : "Unknown error",
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
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const body = await c.req.json();
      const validationResult = UpdateProfileSchema.safeParse(body);

      if (!validationResult.success) {
        return c.json(
          {
            error: "Invalid data",
            details: validationResult.error.issues,
          },
          400,
        );
      }

      const updatedUser = await updateUserProfile(userId, validationResult.data);
      return c.json(updatedUser);
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        return c.json({ error: "User not found or update failed" }, 404);
      }
      logger.error(
        {
          requestId: c.get("requestId"),
          userId,
          error: error instanceof Error ? error.message : "Unknown error",
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
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { password } = c.req.valid("json");
    if (!password) {
      return c.json({ error: "Password is required for confirmation" }, 400);
    }

    try {
      await deleteAllUserData(userId, password);

      logger.info({ requestId: c.get("requestId"), userId }, "All user data deleted successfully");

      return c.json({
        message: "All user data deleted successfully. Your account remains active.",
        accountKept: true,
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message === "User not found") {
          return c.json({ error: "User not found" }, 404);
        }
        if (error.message === "Invalid password") {
          return c.json({ error: "Invalid password provided" }, 400);
        }
      }
      logger.error(
        {
          requestId: c.get("requestId"),
          userId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Error deleting all user data",
      );
      return c.json({ error: "Failed to delete user data" }, 500);
    }
  },
);

// GET /api/user/api-keys - Get all user's API keys
userRoutes.get("/api-keys", async (c) => {
  const userId = await getAuthenticatedUserId(c);
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const apiKeys = await getUserApiKeys(userId);
    return c.json({ apiKeys });
  } catch (error) {
    logger.error(
      {
        requestId: c.get("requestId"),
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error fetching API keys",
    );
    return c.json({ error: "Failed to fetch API keys" }, 500);
  }
});

// POST /api/user/api-keys - Create a new API key
userRoutes.post("/api-keys", async (c) => {
  const userId = await getAuthenticatedUserId(c);
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    const apiKey = await createApiKey(userId, body.name);
    return c.json({ apiKey });
  } catch (error) {
    logger.error(
      {
        requestId: c.get("requestId"),
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error creating API key",
    );
    return c.json({ error: "Failed to create API key" }, 500);
  }
});

// DELETE /api/user/api-keys/:id - Delete a specific API key
userRoutes.delete("/api-keys/:id", async (c) => {
  const userId = await getAuthenticatedUserId(c);
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const keyId = c.req.param("id");
    await deleteApiKey(userId, keyId);
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof ApiKeyNotFoundError) {
      return c.json({ error: "API key not found" }, 404);
    }
    logger.error(
      {
        requestId: c.get("requestId"),
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error deleting API key",
    );
    return c.json({ error: "Failed to delete API key" }, 500);
  }
});

// PATCH /api/user/api-keys/:id - Update API key name
userRoutes.patch("/api-keys/:id", async (c) => {
  const userId = await getAuthenticatedUserId(c);
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const keyId = c.req.param("id");
    const body = await c.req.json();

    if (!body.name || typeof body.name !== "string") {
      return c.json({ error: "Name is required" }, 400);
    }

    const apiKey = await updateApiKeyName(userId, keyId, body.name);
    return c.json({ apiKey });
  } catch (error) {
    if (error instanceof ApiKeyNotFoundError) {
      return c.json({ error: "API key not found" }, 404);
    }
    logger.error(
      {
        requestId: c.get("requestId"),
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
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
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
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
    } catch (error) {
      logger.error(
        {
          requestId: c.get("requestId"),
          userId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Error getting dashboard statistics",
      );
      return c.json({ error: "Failed to get dashboard statistics" }, 500);
    }
  },
);

// POST /api/user/avatar - Upload user avatar
userRoutes.post("/avatar", async (c) => {
  const userId = await getAuthenticatedUserId(c);
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const formData = await c.req.formData();
    const avatarFile = formData.get("avatar") as File;

    if (!avatarFile) {
      return c.json({ error: "Avatar file is required" }, 400);
    }

    const buffer = Buffer.from(await avatarFile.arrayBuffer());
    const result = await uploadUserAvatar(userId, buffer, avatarFile.type);
    return c.json(result);
  } catch (error) {
    if (error instanceof InvalidImageError) {
      return c.json({ error: error.message }, 400);
    }
    if (error instanceof UserNotFoundError) {
      return c.json({ error: error.message }, 500);
    }
    logger.error(
      {
        requestId: c.get("requestId"),
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error uploading avatar",
    );
    return c.json({ error: "Failed to upload avatar" }, 500);
  }
});

// DELETE /api/user/avatar - Remove user avatar
userRoutes.delete("/avatar", async (c) => {
  const userId = await getAuthenticatedUserId(c);
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const result = await deleteUserAvatar(userId);
    logger.info({ requestId: c.get("requestId"), userId }, "Avatar removed successfully");
    return c.json(result);
  } catch (error) {
    if (error instanceof AvatarNotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof UserNotFoundError) {
      return c.json({ error: error.message }, 500);
    }
    logger.error(
      {
        requestId: c.get("requestId"),
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error removing avatar",
    );
    return c.json({ error: "Failed to remove avatar" }, 500);
  }
});

// GET /api/user/activity-timeline - Get activity timeline for dashboard
userRoutes.get("/activity-timeline", async (c) => {
  const userId = await getAuthenticatedUserId(c);
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const daysParam = c.req.query("days");
    const days = daysParam ? parseInt(daysParam, 10) : 30;

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
  } catch (error) {
    logger.error(
      {
        requestId: c.get("requestId"),
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error getting activity timeline",
    );
    return c.json({ error: "Failed to get activity timeline" }, 500);
  }
});

// GET /api/user/due-items - Get items due soon for dashboard
userRoutes.get("/due-items", async (c) => {
  const userId = await getAuthenticatedUserId(c);
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
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
  } catch (error) {
    logger.error(
      {
        requestId: c.get("requestId"),
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error getting due items",
    );
    return c.json({ error: "Failed to get due items" }, 500);
  }
});

// GET /api/user/quick-stats - Get quick stats for dashboard widgets
userRoutes.get("/quick-stats", async (c) => {
  const userId = await getAuthenticatedUserId(c);
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
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
  } catch (error) {
    logger.error(
      {
        requestId: c.get("requestId"),
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
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
    const requestingUserId = await getAuthenticatedUserId(c);
    if (!requestingUserId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const userId = c.req.param("userId");
      const user = await getPublicUserProfile(userId);
      return c.json(user);
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        return c.json({ error: "User not found" }, 404);
      }
      logger.error(
        {
          requestId: c.get("requestId"),
          userId: c.req.param("userId"),
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Error fetching user by ID",
      );
      return c.json({ error: "Failed to fetch user" }, 500);
    }
  },
);

// GET /api/user/:userId/avatar - Serve user avatar
userRoutes.get("/:userId/avatar", async (c) => {
  const userId = c.req.param("userId");
  if (!userId) {
    return c.json({ error: "User ID is required" }, 400);
  }

  try {
    const { stream, metadata } = await getUserAvatar(userId);

    const headers = new Headers();
    headers.set("Content-Type", metadata.contentType || "image/jpeg");
    headers.set("Content-Length", String(metadata.size));
    headers.set("Cache-Control", "public, max-age=86400"); // Cache for 24 hours

    return new Response(stream, { status: 200, headers });
  } catch (error) {
    if (error instanceof AvatarNotFoundError) {
      return c.json({ error: "Avatar not found" }, 404);
    }
    return c.json({ error: "Failed to serve avatar" }, 500);
  }
});
