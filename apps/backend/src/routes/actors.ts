import { ADMIN_ACCESS_INFO, DATA_ACCESS_INFO } from "@eclaire/api-types";
import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { getApiKeyScopeCatalog } from "../lib/auth-principal.js";
import { assertInstanceAdmin } from "../lib/auth-utils.js";
import { createChildLogger } from "../lib/logger.js";
import {
  assertActorCredentialAccess,
  createActorApiKey,
  listActorApiKeys,
  revokeActorApiKey,
  updateActorApiKey,
} from "../lib/services/actor-credentials.js";
import {
  createServiceActor,
  deleteServiceActor,
  getActorSummary,
  listActorSummaries,
  updateServiceActor,
} from "../lib/services/actors.js";
import { withAuth } from "../middleware/with-auth.js";
import {
  CreateActorApiKeySchema,
  CreateServiceActorSchema,
  UpdateActorApiKeySchema,
  UpdateServiceActorSchema,
} from "../schemas/actors-params.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("actors");

export const actorsRoutes = new Hono<{ Variables: RouteVariables }>();

actorsRoutes.get(
  "/credential-scopes",
  withAuth(
    async (c) =>
      c.json({
        items: getApiKeyScopeCatalog(),
        dataAccessLevels: DATA_ACCESS_INFO,
        adminAccessLevels: ADMIN_ACCESS_INFO,
      }),
    logger,
    {
      requiredScopes: ["credentials:read"],
    },
  ),
);

actorsRoutes.post(
  "/services",
  zValidator("json", CreateServiceActorSchema),
  withAuth(
    async (c, userId) => {
      const actor = await createServiceActor(
        userId,
        c.req.valid("json").displayName,
      );
      return c.json(actor, 201);
    },
    logger,
    {
      allowApiKey: false,
    },
  ),
);

actorsRoutes.put(
  "/services/:id",
  zValidator("json", UpdateServiceActorSchema),
  withAuth(
    async (c, userId) => {
      const actor = await updateServiceActor(
        userId,
        c.req.param("id"),
        c.req.valid("json").displayName,
      );
      return c.json(actor);
    },
    logger,
    {
      allowApiKey: false,
    },
  ),
);

actorsRoutes.delete(
  "/services/:id",
  withAuth(
    async (c, userId) => {
      await deleteServiceActor(userId, c.req.param("id"));
      return new Response(null, { status: 204 });
    },
    logger,
    {
      allowApiKey: false,
    },
  ),
);

actorsRoutes.get(
  "/:id/api-keys",
  withAuth(
    async (c, userId, principal) => {
      const actorId = c.req.param("id");
      await assertActorCredentialAccess(userId, actorId, principal.actorId);
      const items = await listActorApiKeys(userId, actorId);
      return c.json({ items });
    },
    logger,
    {
      requiredScopes: ["credentials:read"],
    },
  ),
);

actorsRoutes.post(
  "/:id/api-keys",
  zValidator("json", CreateActorApiKeySchema),
  withAuth(
    async (c, userId, principal) => {
      const actorId = c.req.param("id");
      await assertActorCredentialAccess(userId, actorId, principal.actorId);
      const body = c.req.valid("json");
      if (body.adminAccess && body.adminAccess !== "none") {
        await assertInstanceAdmin(userId);
      }
      const key = await createActorApiKey(
        userId,
        actorId,
        body,
        principal.actorId,
      );
      return c.json(key, 201);
    },
    logger,
    {
      requiredScopes: ["credentials:write"],
    },
  ),
);

actorsRoutes.patch(
  "/:id/api-keys/:keyId",
  zValidator("json", UpdateActorApiKeySchema),
  withAuth(
    async (c, userId, principal) => {
      const actorId = c.req.param("id");
      await assertActorCredentialAccess(userId, actorId, principal.actorId);
      const body = c.req.valid("json");
      if (body.adminAccess && body.adminAccess !== "none") {
        await assertInstanceAdmin(userId);
      }
      const key = await updateActorApiKey(
        userId,
        actorId,
        c.req.param("keyId"),
        body,
      );
      return c.json(key);
    },
    logger,
    {
      requiredScopes: ["credentials:write"],
    },
  ),
);

actorsRoutes.delete(
  "/:id/api-keys/:keyId",
  withAuth(
    async (c, userId, principal) => {
      const actorId = c.req.param("id");
      await assertActorCredentialAccess(userId, actorId, principal.actorId);
      await revokeActorApiKey(userId, actorId, c.req.param("keyId"));
      return new Response(null, { status: 204 });
    },
    logger,
    {
      requiredScopes: ["credentials:write"],
    },
  ),
);

actorsRoutes.get(
  "/",
  withAuth(async (c, userId) => {
    const items = await listActorSummaries(userId);
    return c.json({ items });
  }, logger),
);

actorsRoutes.get(
  "/:id",
  withAuth(async (c, userId) => {
    const actor = await getActorSummary(userId, c.req.param("id"));
    return c.json(actor);
  }, logger),
);
