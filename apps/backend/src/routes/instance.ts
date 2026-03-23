import { Hono } from "hono";
import { createChildLogger } from "../lib/logger.js";
import {
  getInstanceSetting,
  getPublicInstanceDefaults,
} from "../lib/services/instance-settings.js";
import { withAuth } from "../middleware/with-auth.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("instance");

export const instanceRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/instance/defaults - Public instance defaults (any authenticated user)
instanceRoutes.get(
  "/defaults",
  withAuth(async (c) => {
    const defaults = await getPublicInstanceDefaults();
    return c.json(defaults);
  }, logger),
);

// GET /api/instance/registration-status - Public (no auth required)
// Returns whether new user registration is enabled.
instanceRoutes.get("/registration-status", async (c) => {
  const enabled = await getInstanceSetting("instance.registrationEnabled");
  return c.json({ registrationEnabled: enabled !== false });
});
