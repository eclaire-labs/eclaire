import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api-client";

export interface UserPreferences {
  ttsVoice: string;
  autoSendSTT: boolean;
  autoPlayTTS: boolean;
  ttsSpeed: number;
}

const DEFAULTS: UserPreferences = {
  ttsVoice: "",
  autoSendSTT: false,
  autoPlayTTS: false,
  ttsSpeed: 1.0,
};

const QUERY_KEY = ["user-preferences"] as const;

export function useUserPreferences() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await apiGet("/api/user/preferences");
      return (await res.json()) as UserPreferences;
    },
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async (updates: Partial<UserPreferences>) => {
      const res = await apiPatch("/api/user/preferences", updates);
      return (await res.json()) as UserPreferences;
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<UserPreferences>(QUERY_KEY);
      queryClient.setQueryData<UserPreferences>(QUERY_KEY, (old) => ({
        ...DEFAULTS,
        ...old,
        ...updates,
      }));
      return { previous };
    },
    onError: (_err, _updates, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const preferences: UserPreferences = { ...DEFAULTS, ...data };

  const updatePreference = <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) => {
    mutation.mutate({ [key]: value } as Partial<UserPreferences>);
  };

  return { preferences, updatePreference, isLoading };
}
