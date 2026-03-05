import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

export function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

export function mockJsonResponse(data: unknown) {
  return {
    json: () => Promise.resolve(data),
    ok: true,
    status: 200,
  } as unknown as Response;
}

export function makeBaseItem(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    title: `Item ${id}`,
    description: `Description ${id}`,
    tags: ["tag1"],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-02T00:00:00.000Z",
    reviewStatus: "pending",
    flagColor: null,
    isPinned: false,
    enabled: true,
    processingStatus: "completed",
    dueDate: null,
    ...overrides,
  };
}
