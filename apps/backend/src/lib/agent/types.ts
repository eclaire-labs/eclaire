/**
 * Backend Agent Types
 *
 * Extended context and types for the backend agent.
 */

import type { AgentContext } from "@eclaire/ai";

/**
 * User profile context for personalization
 */
export interface UserContext {
  displayName: string | null;
  fullName: string | null;
  bio: string | null;
  timezone: string | null;
  city: string | null;
  country: string | null;
}

/**
 * Backend-specific agent context extending the base AgentContext.
 * Includes user profile information for personalization.
 */
export interface BackendAgentContext extends AgentContext<UserContext> {
  // The userContext field is typed as UserContext via the generic
}
