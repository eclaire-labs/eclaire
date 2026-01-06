import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { createQueryClient } from "@/lib/queryClient";
import { ProcessingEventsProvider } from "./ProcessingEventsProvider";

type QueryProviderProps = {
  children: ReactNode;
};

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ProcessingEventsProvider>{children}</ProcessingEventsProvider>
    </QueryClientProvider>
  );
}
