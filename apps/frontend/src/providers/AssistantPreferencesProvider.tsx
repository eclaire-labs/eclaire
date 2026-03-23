import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { apiGet, apiPatch } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types (public interface stays the same for backward compatibility)
// ---------------------------------------------------------------------------

interface AssistantPreferences {
  showThinkingTokens: boolean;
  showAssistantOverlay: boolean;
  sttProvider: string;
  useStreamingSTT: boolean;
  autoSendSTT: boolean;
  ttsProvider: string;
  useStreamingTTS: boolean;
  autoPlayTTS: boolean;
  sttModel: string;
  ttsModel: string;
  ttsVoice: string;
  ttsSpeed: number;
}

type PreferenceValue = AssistantPreferences[keyof AssistantPreferences];

interface AssistantPreferencesContextType {
  preferences: AssistantPreferences;
  updatePreference: (
    key: keyof AssistantPreferences,
    value: PreferenceValue,
  ) => void;
  isLoaded: boolean;
}

const AssistantPreferencesContext = createContext<
  AssistantPreferencesContextType | undefined
>(undefined);

// ---------------------------------------------------------------------------
// Tier 3: localStorage (UI toggles only)
// ---------------------------------------------------------------------------

const LOCAL_STORAGE_KEY = "assistant-preferences";

interface LocalPreferences {
  showThinkingTokens: boolean;
  showAssistantOverlay: boolean;
}

const LOCAL_DEFAULTS: LocalPreferences = {
  showThinkingTokens: true,
  showAssistantOverlay: true,
};

function readLocalPreferences(): LocalPreferences {
  if (typeof window === "undefined") return LOCAL_DEFAULTS;
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        showThinkingTokens:
          parsed.showThinkingTokens ?? LOCAL_DEFAULTS.showThinkingTokens,
        showAssistantOverlay:
          parsed.showAssistantOverlay ?? LOCAL_DEFAULTS.showAssistantOverlay,
      };
    }
  } catch {
    // Fall through
  }
  return LOCAL_DEFAULTS;
}

function writeLocalPreferences(prefs: LocalPreferences) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore
  }
}

// ---------------------------------------------------------------------------
// One-time migration: move Tier 2 values from localStorage to the database
// ---------------------------------------------------------------------------

const MIGRATION_KEY = "assistant-preferences-migrated";

async function migrateLocalStorageToDb() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATION_KEY)) return;

  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) {
      localStorage.setItem(MIGRATION_KEY, "1");
      return;
    }

    const parsed = JSON.parse(stored);

    // Migrate legacy voiceMode if present
    if ("voiceMode" in parsed) {
      if (parsed.voiceMode) {
        parsed.autoSendSTT ??= true;
        parsed.autoPlayTTS ??= true;
      }
      delete parsed.voiceMode;
    }

    // Extract Tier 2 values to migrate to DB
    const userPrefs: Record<string, unknown> = {};
    if (parsed.ttsVoice) userPrefs.ttsVoice = parsed.ttsVoice;
    if (parsed.autoSendSTT !== undefined)
      userPrefs.autoSendSTT = parsed.autoSendSTT;
    if (parsed.autoPlayTTS !== undefined)
      userPrefs.autoPlayTTS = parsed.autoPlayTTS;
    if (parsed.ttsSpeed !== undefined && parsed.ttsSpeed !== 1.0) {
      userPrefs.ttsSpeed = parsed.ttsSpeed;
    }

    if (Object.keys(userPrefs).length > 0) {
      await apiPatch("/api/user/preferences", userPrefs);
    }

    // Slim localStorage to only Tier 3 values
    const localOnly: LocalPreferences = {
      showThinkingTokens:
        parsed.showThinkingTokens ?? LOCAL_DEFAULTS.showThinkingTokens,
      showAssistantOverlay:
        parsed.showAssistantOverlay ?? LOCAL_DEFAULTS.showAssistantOverlay,
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localOnly));
    localStorage.setItem(MIGRATION_KEY, "1");
  } catch {
    // Non-critical — will retry on next load
  }
}

// ---------------------------------------------------------------------------
// Tier 1: Instance settings (admin-managed)
// ---------------------------------------------------------------------------

interface InstanceAudioSettings {
  sttProvider: string;
  ttsProvider: string;
  sttModel: string;
  ttsModel: string;
  ttsVoice: string;
  useStreamingStt: boolean;
  useStreamingTts: boolean;
}

const INSTANCE_DEFAULTS: InstanceAudioSettings = {
  sttProvider: "",
  ttsProvider: "",
  sttModel: "",
  ttsModel: "",
  ttsVoice: "",
  useStreamingStt: true,
  useStreamingTts: true,
};

function parseInstanceSettings(
  raw: Record<string, unknown>,
): InstanceAudioSettings {
  return {
    sttProvider: (raw["audio.defaultSttProvider"] as string) ?? "",
    ttsProvider: (raw["audio.defaultTtsProvider"] as string) ?? "",
    sttModel: (raw["audio.defaultSttModel"] as string) ?? "",
    ttsModel: (raw["audio.defaultTtsModel"] as string) ?? "",
    ttsVoice: (raw["audio.defaultTtsVoice"] as string) ?? "",
    useStreamingStt: (raw["audio.useStreamingStt"] as boolean) ?? true,
    useStreamingTts: (raw["audio.useStreamingTts"] as boolean) ?? true,
  };
}

// ---------------------------------------------------------------------------
// Keys that belong to each tier (used for routing updates)
// ---------------------------------------------------------------------------

const USER_PREF_KEYS = new Set<keyof AssistantPreferences>([
  "ttsVoice",
  "autoSendSTT",
  "autoPlayTTS",
  "ttsSpeed",
]);

const LOCAL_PREF_KEYS = new Set<keyof AssistantPreferences>([
  "showThinkingTokens",
  "showAssistantOverlay",
]);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AssistantPreferencesProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Tier 3: localStorage
  const [localPrefs, setLocalPrefs] =
    useState<LocalPreferences>(readLocalPreferences);

  // Listen for localStorage changes from other tabs
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent) => {
      if (e.key === LOCAL_STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setLocalPrefs({
            showThinkingTokens:
              parsed.showThinkingTokens ?? LOCAL_DEFAULTS.showThinkingTokens,
            showAssistantOverlay:
              parsed.showAssistantOverlay ??
              LOCAL_DEFAULTS.showAssistantOverlay,
          });
        } catch {
          // Ignore
        }
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Tier 1: Instance settings (admin)
  const { data: instanceRaw } = useQuery({
    queryKey: ["instance-settings"],
    queryFn: async () => {
      const res = await apiGet("/api/admin/settings");
      return (await res.json()) as Record<string, unknown>;
    },
    staleTime: 60 * 1000,
  });
  const instance = instanceRaw
    ? parseInstanceSettings(instanceRaw)
    : INSTANCE_DEFAULTS;

  // Tier 2: User preferences (DB)
  const {
    preferences: userPrefs,
    updatePreference: updateUserPref,
    isLoading: userPrefsLoading,
  } = useUserPreferences();

  // One-time migration
  const migrationRan = useRef(false);
  useEffect(() => {
    if (!migrationRan.current && !userPrefsLoading) {
      migrationRan.current = true;
      migrateLocalStorageToDb();
    }
  }, [userPrefsLoading]);

  // Compose final preferences
  const preferences = useMemo<AssistantPreferences>(
    () => ({
      // Tier 1: admin settings
      sttProvider: instance.sttProvider,
      ttsProvider: instance.ttsProvider,
      sttModel: instance.sttModel,
      ttsModel: instance.ttsModel,
      useStreamingSTT: instance.useStreamingStt,
      useStreamingTTS: instance.useStreamingTts,
      // Tier 2: user prefs (with admin voice fallback)
      ttsVoice: userPrefs.ttsVoice || instance.ttsVoice,
      autoSendSTT: userPrefs.autoSendSTT,
      autoPlayTTS: userPrefs.autoPlayTTS,
      ttsSpeed: userPrefs.ttsSpeed,
      // Tier 3: localStorage
      showThinkingTokens: localPrefs.showThinkingTokens,
      showAssistantOverlay: localPrefs.showAssistantOverlay,
    }),
    [instance, userPrefs, localPrefs],
  );

  const updatePreference = useCallback(
    (key: keyof AssistantPreferences, value: PreferenceValue) => {
      if (USER_PREF_KEYS.has(key)) {
        updateUserPref(
          key as "ttsVoice" | "autoSendSTT" | "autoPlayTTS" | "ttsSpeed",
          value as never,
        );
      } else if (LOCAL_PREF_KEYS.has(key)) {
        setLocalPrefs((prev) => {
          const next = { ...prev, [key]: value };
          writeLocalPreferences(next);
          return next;
        });
      }
      // Admin keys are read-only for users — no-op
    },
    [updateUserPref],
  );

  const isLoaded = !userPrefsLoading;

  const contextValue = useMemo<AssistantPreferencesContextType>(
    () => ({ preferences, updatePreference, isLoaded }),
    [preferences, updatePreference, isLoaded],
  );

  return (
    <AssistantPreferencesContext.Provider value={contextValue}>
      {children}
    </AssistantPreferencesContext.Provider>
  );
}

// Hook to use assistant preferences (unchanged public API)
export function useAssistantPreferences(): [
  AssistantPreferences,
  (key: keyof AssistantPreferences, value: PreferenceValue) => void,
  boolean,
] {
  const context = useContext(AssistantPreferencesContext);

  if (context === undefined) {
    throw new Error(
      "useAssistantPreferences must be used within an AssistantPreferencesProvider",
    );
  }

  return [context.preferences, context.updatePreference, context.isLoaded];
}
