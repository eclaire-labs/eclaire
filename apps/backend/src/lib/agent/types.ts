/**
 * Backend Agent Types
 */

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
