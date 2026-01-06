import { createContext, type ReactNode, useContext } from "react";
import type { MobileTab } from "@/components/mobile/mobile-tab-bar";

interface MobileNavigationContextValue {
  /** Current active mobile tab */
  currentMobileTab: MobileTab;
  /** Set the current mobile tab */
  setCurrentMobileTab: (tab: MobileTab) => void;
  /** Whether the folders sheet is open */
  foldersSheetOpen: boolean;
  /** Set folders sheet open state */
  setFoldersSheetOpen: (open: boolean) => void;
  /** Whether the chat is open */
  chatOpen: boolean;
  /** Set chat open state */
  setChatOpen: (open: boolean) => void;
}

const MobileNavigationContext =
  createContext<MobileNavigationContextValue | null>(null);

interface MobileNavigationProviderProps {
  children: ReactNode;
  value: MobileNavigationContextValue;
}

export function MobileNavigationProvider({
  children,
  value,
}: MobileNavigationProviderProps) {
  return (
    <MobileNavigationContext.Provider value={value}>
      {children}
    </MobileNavigationContext.Provider>
  );
}

export function useMobileNavigation() {
  const context = useContext(MobileNavigationContext);
  if (!context) {
    throw new Error(
      "useMobileNavigation must be used within a MobileNavigationProvider",
    );
  }
  return context;
}

// Safe version that returns null instead of throwing on desktop
export function useMobileNavigationSafe() {
  const context = useContext(MobileNavigationContext);
  return context; // Returns null if not within provider, which is fine for desktop
}
