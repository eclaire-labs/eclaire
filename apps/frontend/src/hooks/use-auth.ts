import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth";
import { apiFetch } from "@/lib/frontend-api";

export interface User {
  id: string;
  email: string;
  displayName?: string;
  fullName?: string;
  name?: string;
  image?: string;
  bio?: string;
  timezone?: string;
  city?: string;
  country?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AuthSession {
  user: User;
  session: {
    id: string;
    expiresAt: Date;
    token: string;
    ipAddress?: string;
    userAgent?: string;
  };
}

/**
 * Simplified auth hook that primarily uses Better Auth's session
 * Optionally fetches enhanced user profile data when available
 */
export function useAuth() {
  // Use Better Auth's session hook as the primary source of truth
  const {
    data: session,
    isPending: isSessionPending,
    error: sessionError,
  } = useSession();

  // Authentication state is determined by Better Auth session
  const isAuthenticated = !!session?.user?.id;

  // Optionally fetch enhanced user profile data
  const {
    data: userProfile,
    isPending: isProfilePending,
    error: profileError,
  } = useQuery({
    queryKey: ["user-profile", session?.user?.id],
    queryFn: async () => {
      const response = await apiFetch("/api/user");
      if (!response.ok) {
        // Don't throw on 401 - just return null to indicate no enhanced profile
        if (response.status === 401) {
          return null;
        }
        throw new Error("Failed to fetch user profile");
      }
      const data = await response.json();
      return data.user as User;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      // Don't retry on 401 errors
      if (error instanceof Error && error.message.includes("401")) {
        return false;
      }
      return failureCount < 2;
    },
  });

  // Return session data with optional enhanced profile
  const data = session
    ? {
        user: userProfile ? { ...session.user, ...userProfile } : session.user,
        session: session.session,
      }
    : null;

  return {
    data,
    isPending: isSessionPending,
    error: sessionError || profileError,
    isAuthenticated,
    // Separate loading states for different concerns
    isSessionLoading: isSessionPending,
    isProfileLoading: isProfilePending,
  };
}
