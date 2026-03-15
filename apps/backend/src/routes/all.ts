// routes/all.ts
import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import { ValidationError } from "../lib/errors.js";
import { createChildLogger } from "../lib/logger.js";
// Import service functions
import {
  classifyAndCreateContent,
  detectAndVerifyMimeType,
  findAllEntriesPaginated,
} from "../lib/services/all.js";
import { parseSearchFields } from "../lib/search-params.js";
import { principalCaller } from "../lib/services/types.js";
import { withAuth } from "../middleware/with-auth.js";
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
  withAuth(async (c, userId) => {
    const params = c.req.valid("query");
    const { tags, startDate, endDate } = parseSearchFields(params);

    const types = params.types
      ? params.types.split(",").map((t: string) => t.trim())
      : undefined;

    const result = await findAllEntriesPaginated({
      userId,
      text: params.text,
      tagsList: tags,
      startDate,
      endDate,
      types,
      limit: params.limit,
      cursor: params.cursor,
      dueStatus: params.dueStatus,
      isPinned:
        params.isPinned === "true"
          ? true
          : params.isPinned === "false"
            ? false
            : undefined,
      flagged: params.flagged === "true" ? true : undefined,
      flagColor: params.flagColor,
      reviewStatus: params.reviewStatus,
    });

    return c.json(result);
  }, logger),
);

// POST /api/all - Create any content type
allRoutes.post(
  "/",
  describeRoute(postAllRouteDescription),
  withAuth(async (c, userId, principal) => {
    const caller = principalCaller(principal);
    const formData = await c.req.formData();
    const metadataPart = formData.get("metadata");
    const contentPart = formData.get("content") as File;

    if (!contentPart) {
      throw new ValidationError("The 'content' part is required.");
    }

    // Parse and validate metadata — passthrough allows type-specific fields
    // (e.g. deviceId for photos) to flow through to downstream handlers
    let rawJson: unknown;
    try {
      rawJson = JSON.parse((metadataPart as string) || "{}");
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ValidationError("Invalid metadata JSON format");
      }
      throw error;
    }
    const metadata = CreateMetadataSchema.passthrough().parse(rawJson);
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
    const result = await classifyAndCreateContent(
      {
        contentBuffer,
        mimeType: verifiedMimeType,
        metadata,
        filename: contentPart.name,
        userId,
        userAgent,
        requestId,
      },
      caller,
    );

    if (result.success) {
      return c.json(result.result, 201);
    } else {
      return c.json({ error: result.error }, result.statusCode as 400 | 500);
    }
  }, logger),
);
