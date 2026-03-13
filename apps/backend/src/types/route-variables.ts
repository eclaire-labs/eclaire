// Shared Variables type for all Hono routes
import type { AuthPrincipal } from "../lib/auth-principal.js";
import type { Session, User } from "../lib/auth.js";

export type SessionResolver = () => Promise<{
  user: User;
  session: Session;
} | null>;

export type RouteVariables = {
  user: User | null;
  session: Session | null;
  principal: AuthPrincipal | null;
  resolveSession: SessionResolver;
  requestId: string;
};
