import type { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import type { Logger } from "pino";
import z from "zod/v4";
import { NotFoundError } from "../lib/errors.js";
import { principalCaller, type CallerContext } from "../lib/services/types.js";
import { withAuth } from "../middleware/with-auth.js";
import {
  flagColorUpdateSchema,
  isPinnedUpdateSchema,
  reviewStatusUpdateSchema,
} from "../schemas/common.js";
import type { RouteVariables } from "../types/route-variables.js";

const reprocessBodySchema = z.object({
  force: z.boolean().optional().default(false),
});

type AppRouter = Hono<{ Variables: RouteVariables }>;

type UpdateFn = (
  id: string,
  // biome-ignore lint/suspicious/noExplicitAny: update functions have varying return types per resource
  data: Record<string, any>,
  caller: CallerContext,
  // biome-ignore lint/suspicious/noExplicitAny: update functions have varying return types per resource
) => Promise<any>;
type ReprocessFn = (
  id: string,
  userId: string,
  force: boolean,
  caller: CallerContext,
) => Promise<{ success: boolean; error?: string }>;

// biome-ignore lint/suspicious/noExplicitAny: route description objects are untyped OpenAPI specs
type RouteDescription = any;

export function registerReviewEndpoint(
  router: AppRouter,
  resourceName: string,
  routeDescription: RouteDescription,
  updateFn: UpdateFn,
  logger: Logger,
): void {
  router.patch(
    "/:id/review",
    describeRoute(routeDescription),
    zValidator("json", reviewStatusUpdateSchema(resourceName)),
    withAuth(async (c, _userId, principal) => {
      const caller = principalCaller(principal);
      const id = c.req.param("id");
      const { reviewStatus } = c.req.valid("json");
      const updated = await updateFn(id, { reviewStatus }, caller);
      if (!updated) throw new NotFoundError(resourceName);
      return c.json(updated);
    }, logger),
  );
}

export function registerFlagEndpoint(
  router: AppRouter,
  resourceName: string,
  routeDescription: RouteDescription,
  updateFn: UpdateFn,
  logger: Logger,
): void {
  router.patch(
    "/:id/flag",
    describeRoute(routeDescription),
    zValidator("json", flagColorUpdateSchema(resourceName)),
    withAuth(async (c, _userId, principal) => {
      const caller = principalCaller(principal);
      const id = c.req.param("id");
      const { flagColor } = c.req.valid("json");
      const updated = await updateFn(id, { flagColor }, caller);
      if (!updated) throw new NotFoundError(resourceName);
      return c.json(updated);
    }, logger),
  );
}

export function registerPinEndpoint(
  router: AppRouter,
  resourceName: string,
  routeDescription: RouteDescription,
  updateFn: UpdateFn,
  logger: Logger,
): void {
  router.patch(
    "/:id/pin",
    describeRoute(routeDescription),
    zValidator("json", isPinnedUpdateSchema(resourceName)),
    withAuth(async (c, _userId, principal) => {
      const caller = principalCaller(principal);
      const id = c.req.param("id");
      const { isPinned } = c.req.valid("json");
      const updated = await updateFn(id, { isPinned }, caller);
      if (!updated) throw new NotFoundError(resourceName);
      return c.json(updated);
    }, logger),
  );
}

export function registerReprocessEndpoint(
  router: AppRouter,
  resourceName: string,
  idKeyName: string,
  reprocessFn: ReprocessFn,
  logger: Logger,
): void {
  router.post(
    "/:id/reprocess",
    zValidator("json", reprocessBodySchema),
    withAuth(async (c, userId, principal) => {
      const caller = principalCaller(principal);
      const id = c.req.param("id");
      const { force } = c.req.valid("json");

      const result = await reprocessFn(id, userId, force, caller);

      if (result.success) {
        return c.json(
          {
            message: `${resourceName} queued for reprocessing successfully`,
            [idKeyName]: id,
          },
          202,
        );
      }
      return c.json({ error: result.error }, 400);
    }, logger),
  );
}

export function registerCommonEndpoints(
  router: AppRouter,
  config: {
    resourceName: string;
    idKeyName: string;
    updateFn: UpdateFn;
    reprocessFn: ReprocessFn;
    routeDescriptions: {
      review: RouteDescription;
      flag: RouteDescription;
      pin: RouteDescription;
    };
    logger: Logger;
  },
): void {
  const {
    resourceName,
    idKeyName,
    updateFn,
    reprocessFn,
    routeDescriptions,
    logger,
  } = config;

  registerReviewEndpoint(
    router,
    resourceName,
    routeDescriptions.review,
    updateFn,
    logger,
  );
  registerFlagEndpoint(
    router,
    resourceName,
    routeDescriptions.flag,
    updateFn,
    logger,
  );
  registerPinEndpoint(
    router,
    resourceName,
    routeDescriptions.pin,
    updateFn,
    logger,
  );
  registerReprocessEndpoint(
    router,
    resourceName,
    idKeyName,
    reprocessFn,
    logger,
  );
}
