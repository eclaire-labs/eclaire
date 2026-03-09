import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

type EntityType = "bookmarks" | "documents" | "notes" | "photos" | "tasks";

export function useTags(type?: EntityType) {
  return useQuery<string[]>({
    queryKey: type ? ["tags", type] : ["tags"],
    queryFn: async () => {
      const url = type ? `/api/tags?type=${type}` : "/api/tags";
      const res = await apiFetch(url);
      const data = await res.json();
      return data.items;
    },
    staleTime: 2 * 60_000,
  });
}
