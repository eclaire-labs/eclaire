import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import {
  createAgent,
  deleteAgent,
  getAgent,
  getAgentCatalog,
  getSkillDetail,
  listAgents,
  updateAgent,
} from "../lib/services/agents.js";
import { createChildLogger } from "../lib/logger.js";
import { principalCaller } from "../lib/services/types.js";
import { withAuth } from "../middleware/with-auth.js";
import {
  CreateAgentSchema,
  UpdateAgentSchema,
} from "../schemas/agents-params.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("agents");

export const agentsRoutes = new Hono<{ Variables: RouteVariables }>();

agentsRoutes.get(
  "/",
  withAuth(async (c, userId) => {
    const items = await listAgents(userId);
    return c.json({ items });
  }, logger),
);

agentsRoutes.get(
  "/catalog",
  withAuth(async (c) => c.json(getAgentCatalog()), logger),
);

agentsRoutes.get(
  "/catalog/skills/:name",
  withAuth(async (c) => {
    const detail = getSkillDetail(c.req.param("name"));
    return c.json(detail);
  }, logger),
);

agentsRoutes.get(
  "/:id",
  withAuth(async (c, userId) => {
    const agent = await getAgent(userId, c.req.param("id"));
    return c.json(agent);
  }, logger),
);

agentsRoutes.post(
  "/",
  zValidator("json", CreateAgentSchema),
  withAuth(async (c, userId, principal) => {
    const caller = principalCaller(principal);
    const agent = await createAgent(userId, c.req.valid("json"), caller);
    return c.json(agent, 201);
  }, logger),
);

agentsRoutes.put(
  "/:id",
  zValidator("json", UpdateAgentSchema),
  withAuth(async (c, userId, principal) => {
    const caller = principalCaller(principal);
    const agent = await updateAgent(
      userId,
      c.req.param("id"),
      c.req.valid("json"),
      caller,
    );
    return c.json(agent);
  }, logger),
);

agentsRoutes.delete(
  "/:id",
  withAuth(async (c, userId, principal) => {
    const caller = principalCaller(principal);
    await deleteAgent(userId, c.req.param("id"), caller);
    return new Response(null, { status: 204 });
  }, logger),
);
