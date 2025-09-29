// lib/auth.ts
"use client"; // Good practice to add this to client-only modules

import { createAuthClient } from "better-auth/react";

// Create the Better Auth client for client-side use
export const authClient = createAuthClient({
  baseURL: "", // Use relative URLs - requests go through Next.js proxy
});

// Export commonly used methods for convenience
export const { signIn, signOut, signUp, useSession } = authClient;

// Types for Better Auth
export type Session = typeof authClient.$Infer.Session;

/**
 * Client-side function to get the current session using Better Auth React client.
 * This is a simple wrapper around the imported useSession.
 */
export function useAuthSession() {
  return useSession();
}

/**
 * Utility function for client-side authentication actions
 * This properly uses the Better Auth client SDK
 */
export const auth = {
  signIn: authClient.signIn.email,
  signOut: authClient.signOut,
  signUp: authClient.signUp.email,
  // Add other auth methods as needed
} as const;
