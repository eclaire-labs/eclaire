
import { useSession } from "@/lib/auth";

/**
 * Simplified auth hook for navbar that only uses Better Auth session
 * Avoids additional API calls and focuses on core authentication state
 */
export function useNavbarAuth() {
  const { data: session, isPending, error } = useSession();

  return {
    isAuthenticated: !!session?.user?.id,
    user: session?.user || null,
    isPending,
    error,
  };
}
