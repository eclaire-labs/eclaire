import { Hono } from "hono";
import { assertInstanceAdmin } from "../lib/auth-utils.js";
import { browserRuntime } from "../lib/browser/index.js";
import { createChildLogger } from "../lib/logger.js";
import { withAuth } from "../middleware/with-auth.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("browser");

const SETTINGS_CONTEXT = {
  requestId: "browser-settings",
};

export const browserRoutes = new Hono<{ Variables: RouteVariables }>();

browserRoutes.get(
  "/status",
  withAuth(
    async (c, userId) => {
      await assertInstanceAdmin(userId);
      return c.json(browserRuntime.getStatus(SETTINGS_CONTEXT.requestId));
    },
    logger,
    { allowApiKey: false },
  ),
);

browserRoutes.post(
  "/attach",
  withAuth(
    async (c, userId) => {
      await assertInstanceAdmin(userId);
      const status = await browserRuntime.attach(SETTINGS_CONTEXT.requestId);
      return c.json(status);
    },
    logger,
    { allowApiKey: false },
  ),
);

browserRoutes.post(
  "/detach",
  withAuth(
    async (c, userId) => {
      await assertInstanceAdmin(userId);
      const status = await browserRuntime.detach(SETTINGS_CONTEXT.requestId);
      return c.json(status);
    },
    logger,
    { allowApiKey: false },
  ),
);

browserRoutes.get(
  "/tabs",
  withAuth(
    async (c, userId) => {
      await assertInstanceAdmin(userId);
      const items = await browserRuntime.listTabs(SETTINGS_CONTEXT);
      return c.json({ items });
    },
    logger,
    { allowApiKey: false },
  ),
);
