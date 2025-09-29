import { QueryClient } from "@tanstack/react-query";

// Default configuration for all Query Clients
export const defaultQueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
      retry: (failureCount: number, error: unknown) => {
        // Don't retry on 401 errors
        if (error instanceof Error && error.message.includes("401")) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
};

// Factory function to create a QueryClient with standardized configuration
export function createQueryClient() {
  return new QueryClient(defaultQueryClientConfig);
}
