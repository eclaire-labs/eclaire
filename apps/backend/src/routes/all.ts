// routes/all.ts
import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import z from "zod/v4";
import { getAuthenticatedUserId } from "../lib/auth-utils.js";
import { createChildLogger } from "../lib/logger.js";
// Import service functions
import {
  classifyAndCreateContent,
  countAllEntries,
  detectAndVerifyMimeType,
  findAllEntries,
} from "../lib/services/all.js";
// Import schemas
import {
  CreateMetadataSchema,
  SearchQuerySchema,
} from "../schemas/all-params.js";
import {
  getAllRouteDescription,
  postAllRouteDescription,
} from "../schemas/all-routes.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("all");

export const allRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/all - Search across all content types
allRoutes.get(
  "/",
  describeRoute(getAllRouteDescription),
  zValidator("query", SearchQuerySchema),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const params = c.req.valid("query");
      const tagsList = params.tags
        ? params.tags.split(",").map((tag: string) => tag.trim())
        : undefined;
      const startDate = params.startDate
        ? new Date(params.startDate)
        : undefined;
      const endDate = params.endDate ? new Date(params.endDate) : undefined;

      const allItems = await findAllEntries(
        userId,
        params.text,
        tagsList,
        startDate,
        endDate,
        undefined,
        params.limit,
        params.dueStatus,
      );

      const totalCount = await countAllEntries(
        userId,
        params.text,
        tagsList,
        startDate,
        endDate,
        undefined,
        params.dueStatus,
      );

      return c.json({
        items: allItems,
        totalCount,
        limit: params.limit,
        offset: params.offset,
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
        "Error searching all items:",
      );
      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid search parameters", details: error.issues },
          400,
        );
      }
      return c.json({ error: "Failed to search all items" }, 500);
    }
  },
);

// POST /api/all - Create any content type
allRoutes.post("/", describeRoute(postAllRouteDescription), async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const formData = await c.req.formData();
    const metadataPart = formData.get("metadata");
    const contentPart = formData.get("content") as File;

    if (!contentPart) {
      return c.json({ error: "The 'content' part is required." }, 400);
    }

    // Parse the raw metadata first (keep all fields for database storage)
    let rawMetadata: Record<string, unknown>;
    try {
      rawMetadata = JSON.parse((metadataPart as string) || "{}");
    } catch (error) {
      if (error instanceof SyntaxError) {
        return c.json({ error: "Invalid metadata JSON format" }, 400);
      }
      throw error;
    }

    // Then validate only the fields we need for our internal logic
    const validatedMetadata = CreateMetadataSchema.parse(rawMetadata);

    // Merge: use the raw metadata as base, but overlay our validated fields
    const metadata = { ...rawMetadata, ...validatedMetadata };
    const contentBuffer = Buffer.from(await contentPart.arrayBuffer());
    const originalMimeType = contentPart.type;
    const userAgent = c.req.header("User-Agent") || "";
    const requestId = c.get("requestId");

    // Detect and verify MIME type using service
    const verifiedMimeType = await detectAndVerifyMimeType(
      contentBuffer,
      originalMimeType,
      contentPart.name,
    );

    // Log request details for troubleshooting
    logger.info(
      {
        requestId,
        userId,
        contentPartName: contentPart.name,
        contentPartType: contentPart.type,
        contentSize: contentBuffer.length,
        originalMimeType,
        verifiedMimeType,
        userAgent,
        metadataKeys: Object.keys(metadata),
        metadata: {
          assetType: metadata.assetType,
          title: metadata.title,
          originalFilename: metadata.originalFilename,
          url: metadata.url?.substring(0, 100),
        },
      },
      "POST /api/all - Request details",
    );

    // Classify and create content using service
    const result = await classifyAndCreateContent({
      contentBuffer,
      mimeType: verifiedMimeType,
      metadata,
      filename: contentPart.name,
      userId,
      userAgent,
      requestId,
    });

    if (result.success) {
      return c.json(result.result, 201);
    } else {
      return c.json({ error: result.error }, result.statusCode as 400 | 500);
    }
  } catch (error) {
    const requestId = c.get("requestId");
    logger.error(
      {
        requestId,
        userId: await getAuthenticatedUserId(c),
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error in POST /api/all endpoint:",
    );
    if (error instanceof z.ZodError) {
      return c.json(
        { error: "Invalid metadata format", details: error.issues },
        400,
      );
    }
    return c.json({ error: "Failed to process request" }, 500);
  }
});
