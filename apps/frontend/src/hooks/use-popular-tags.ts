import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface PopularTag {
  name: string;
  count: number;
}

export function usePopularTags(limit: number = 10) {
  return useQuery<PopularTag[]>({
    queryKey: ["tags", "popular", limit],
    queryFn: async () => {
      const res = await apiFetch(`/api/tags/popular?limit=${limit}`);
      return res.json();
    },
    staleTime: 5 * 60_000,
    enabled: limit > 0,
  });
}
