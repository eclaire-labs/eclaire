// lib/auth.ts
import { createAuthClient } from "better-auth/react";

// Create the Better Auth client for client-side use
export const authClient = createAuthClient({
  baseURL: "", // Use relative URLs - requests go through Vite proxy (dev) or same-origin (prod)
});

// Export commonly used methods for convenience
export const { signIn, signOut, signUp, useSession } = authClient;

// Types for Better Auth
export type Session = typeof authClient.$Infer.Session;
