import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import { ValidationError } from "../lib/errors.js";
import { createChildLogger } from "../lib/logger.js";
import {
  createApiKey,
  // Dashboard & data functions (already delegated)
  deleteAllUserData,
  deleteApiKey,
  deleteUserAvatar,
  getActivityTimeline,
  getDashboardStatistics,
  getDueItems,
  getPublicUserProfile,
  getQuickStats,
  getUserApiKeys,
  getUserAvatar,
  // New service functions
  getUserWithAssignees,
  updateApiKeyName,
  updateUserProfile,
  uploadUserAvatar,
} from "../lib/services/user-data.js";
import { withAuth } from "../middleware/with-auth.js";
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

const logger = createChildLogger("user");

export const userRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/user - Get the current authenticated user's complete profile
userRoutes.get(
  "/",
  describeRoute(getUserProfileRouteDescription),
  withAuth(async (c, userId) => {
    const result = await getUserWithAssignees(userId);
    return c.json(result);
  }, logger),
);

// PATCH /api/user/profile - Update the user's profile
userRoutes.patch(
  "/profile",
  describeRoute(updateUserProfileRouteDescription),
  withAuth(async (c, userId) => {
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
  }, logger),
);

// POST /api/user/delete-all-data - Delete all user data while keeping account
userRoutes.post(
  "/delete-all-data",
  describeRoute(deleteAllUserDataRouteDescription),
  zValidator("json", DeleteAllUserDataSchema),
  withAuth(async (c, userId) => {
    const { password } = c.req.valid("json");
    if (!password) {
      throw new ValidationError("Password is required for confirmation");
    }

    try {
      await deleteAllUserData(userId, password);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "Invalid password") {
        throw new ValidationError("Invalid password provided");
      }
      throw error;
    }

    logger.info(
      { requestId: c.get("requestId"), userId },
      "All user data deleted successfully",
    );

    return c.json({
      message:
        "All user data deleted successfully. Your account remains active.",
      accountKept: true,
    });
  }, logger),
);

// GET /api/user/api-keys - Get all user's API keys
userRoutes.get(
  "/api-keys",
  withAuth(async (c, userId) => {
    const apiKeys = await getUserApiKeys(userId);
    return c.json({ apiKeys });
  }, logger),
);

// POST /api/user/api-keys - Create a new API key
userRoutes.post(
  "/api-keys",
  withAuth(async (c, userId) => {
    const body = await c.req.json();
    const apiKey = await createApiKey(userId, body.name);
    return c.json({ apiKey });
  }, logger),
);

// DELETE /api/user/api-keys/:id - Delete a specific API key
userRoutes.delete(
  "/api-keys/:id",
  withAuth(async (c, userId) => {
    const keyId = c.req.param("id");
    await deleteApiKey(userId, keyId);
    return c.json({ success: true });
  }, logger),
);

// PATCH /api/user/api-keys/:id - Update API key name
userRoutes.patch(
  "/api-keys/:id",
  withAuth(async (c, userId) => {
    const keyId = c.req.param("id");
    const body = await c.req.json();

    if (!body.name || typeof body.name !== "string") {
      throw new ValidationError("Name is required");
    }

    const apiKey = await updateApiKeyName(userId, keyId, body.name);
    return c.json({ apiKey });
  }, logger),
);

// GET /api/user/dashboard-stats - Get dashboard statistics
userRoutes.get(
  "/dashboard-stats",
  describeRoute(getUserDashboardStatsRouteDescription),
  withAuth(async (c, userId) => {
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
  }, logger),
);

// POST /api/user/avatar - Upload user avatar
userRoutes.post(
  "/avatar",
  withAuth(async (c, userId) => {
    const formData = await c.req.formData();
    const avatarFile = formData.get("avatar") as File;

    if (!avatarFile) {
      throw new ValidationError("Avatar file is required");
    }

    const buffer = Buffer.from(await avatarFile.arrayBuffer());
    const result = await uploadUserAvatar(userId, buffer, avatarFile.type);
    return c.json(result);
  }, logger),
);

// DELETE /api/user/avatar - Remove user avatar
userRoutes.delete(
  "/avatar",
  withAuth(async (c, userId) => {
    const result = await deleteUserAvatar(userId);
    logger.info(
      { requestId: c.get("requestId"), userId },
      "Avatar removed successfully",
    );
    return c.json(result);
  }, logger),
);

// GET /api/user/activity-timeline - Get activity timeline for dashboard
userRoutes.get(
  "/activity-timeline",
  withAuth(async (c, userId) => {
    const daysParam = c.req.query("days");
    const days = daysParam ? parseInt(daysParam, 10) : 30;

    if (Number.isNaN(days) || days < 1 || days > 365) {
      throw new ValidationError(
        "Invalid days parameter. Must be between 1 and 365.",
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
  }, logger),
);

// GET /api/user/due-items - Get items due soon for dashboard
userRoutes.get(
  "/due-items",
  withAuth(async (c, userId) => {
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
  }, logger),
);

// GET /api/user/quick-stats - Get quick stats for dashboard widgets
userRoutes.get(
  "/quick-stats",
  withAuth(async (c, userId) => {
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
  }, logger),
);

// GET /api/user/:userId - Get user information by ID (for workers/AI assistants)
userRoutes.get(
  "/:userId",
  describeRoute(getPublicUserProfileRouteDescription),
  withAuth(async (c, _userId) => {
    const userId = c.req.param("userId");
    const user = await getPublicUserProfile(userId);
    return c.json(user);
  }, logger),
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
    if (error instanceof Error && error.name === "NotFoundError") {
      return c.json({ error: "Avatar not found" }, 404);
    }
    return c.json({ error: "Failed to serve avatar" }, 500);
  }
});
