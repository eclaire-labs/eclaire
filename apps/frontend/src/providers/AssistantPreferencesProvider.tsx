import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";


interface AssistantPreferences {
  showThinkingTokens: boolean;
  showAssistantOverlay: boolean;
}

const DEFAULT_PREFERENCES: AssistantPreferences = {
  showThinkingTokens: true,
  showAssistantOverlay: true,
};

const STORAGE_KEY = "assistant-preferences";

interface AssistantPreferencesContextType {
  preferences: AssistantPreferences;
  updatePreference: (key: keyof AssistantPreferences, value: boolean) => void;
  isLoaded: boolean;
}

const AssistantPreferencesContext = createContext<
  AssistantPreferencesContextType | undefined
>(undefined);

interface AssistantPreferencesProviderProps {
  children: ReactNode;
}

// Read initial preferences from localStorage synchronously to avoid double-render
function readStoredAssistantPreferences(): AssistantPreferences {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
      }
    } catch {
      // Fall through to defaults
    }
  }
  return DEFAULT_PREFERENCES;
}

export function AssistantPreferencesProvider({
  children,
}: AssistantPreferencesProviderProps) {
  const [preferences, setPreferences] = useState<AssistantPreferences>(
    readStoredAssistantPreferences,
  );

  // Listen for localStorage changes from other tabs
  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
          } catch {
            // Ignore malformed data
          }
        }
      };

      window.addEventListener("storage", handleStorageChange);
      return () => window.removeEventListener("storage", handleStorageChange);
    }
  }, []);

  const updatePreference = useCallback(
    (key: keyof AssistantPreferences, value: boolean) => {
      setPreferences((prev) => {
        const newPreferences = { ...prev, [key]: value };
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newPreferences));
          } catch {
            // Ignore storage errors
          }
        }
        return newPreferences;
      });
    },
    [],
  );

  const value = useMemo<AssistantPreferencesContextType>(
    () => ({
      preferences,
      updatePreference,
      isLoaded: true,
    }),
    [preferences, updatePreference],
  );

  return (
    <AssistantPreferencesContext.Provider value={value}>
      {children}
    </AssistantPreferencesContext.Provider>
  );
}

// Hook to use assistant preferences
export function useAssistantPreferences(): [
  AssistantPreferences,
  (key: keyof AssistantPreferences, value: boolean) => void,
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
