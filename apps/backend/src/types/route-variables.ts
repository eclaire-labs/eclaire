// Shared Variables type for all Hono routes
import type { Session, User } from "../lib/auth.js";

export type RouteVariables = {
  user: User | null;
  session: Session | null;
  requestId: string;
};
