// Shared Variables type for all Hono routes
export type RouteVariables = {
  user: any | null;
  session: any | null;
  requestId: string;
};
