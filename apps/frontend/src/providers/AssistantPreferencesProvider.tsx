import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

interface AssistantPreferences {
  streamingEnabled: boolean;
  showThinkingTokens: boolean;
  showAssistantOverlay: boolean;
}

const DEFAULT_PREFERENCES: AssistantPreferences = {
  streamingEnabled: true,
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

export function AssistantPreferencesProvider({
  children,
}: AssistantPreferencesProviderProps) {
  const [preferences, setPreferences] =
    useState<AssistantPreferences>(DEFAULT_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load preferences from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
        }
      } catch (error) {
        console.warn("Failed to load assistant preferences:", error);
      }
    }
    // Always mark as loaded regardless of whether we're on server or client
    setIsLoaded(true);
  }, []);

  // Listen for localStorage changes from other tabs/components
  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
          } catch (error) {
            console.warn(
              "Failed to parse preferences from storage event:",
              error,
            );
          }
        }
      };

      window.addEventListener("storage", handleStorageChange);
      return () => window.removeEventListener("storage", handleStorageChange);
    }
  }, []);

  const updatePreference = (
    key: keyof AssistantPreferences,
    value: boolean,
  ) => {
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newPreferences));

        // Dispatch a custom event to notify other components in the same window
        // (storage event only fires for other tabs, not the current one)
        window.dispatchEvent(
          new CustomEvent("assistant-preferences-changed", {
            detail: newPreferences,
          }),
        );
      } catch (error) {
        console.error("Failed to save assistant preferences:", error);
      }
    }
  };

  // Listen for custom events from the same window
  useEffect(() => {
    if (typeof window !== "undefined") {
      const handlePreferencesChanged = (
        e: CustomEvent<AssistantPreferences>,
      ) => {
        setPreferences(e.detail);
      };

      window.addEventListener(
        "assistant-preferences-changed",
        handlePreferencesChanged as EventListener,
      );
      return () =>
        window.removeEventListener(
          "assistant-preferences-changed",
          handlePreferencesChanged as EventListener,
        );
    }
  }, []);

  const value: AssistantPreferencesContextType = {
    preferences,
    updatePreference,
    isLoaded,
  };

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
