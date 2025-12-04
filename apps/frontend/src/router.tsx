import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree";

export interface RouterContext {
  auth: {
    isAuthenticated: boolean;
    isLoading: boolean;
    user: {
      id: string;
      email: string;
      name?: string | null;
      displayName?: string | null;
    } | null;
  };
}

export const router = createRouter({
  routeTree,
  context: {
    auth: {
      isAuthenticated: false,
      isLoading: true,
      user: null,
    },
  },
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
