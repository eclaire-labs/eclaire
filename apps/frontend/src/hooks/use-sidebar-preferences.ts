import { useCallback, useSyncExternalStore } from "react";

interface SidebarPreferences {
  popularTagCount: number;
  showPopularTags: boolean;
}

const STORAGE_KEY = "sidebar-preferences";

const DEFAULTS: SidebarPreferences = {
  popularTagCount: 10,
  showPopularTags: true,
};

function read(): SidebarPreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULTS, ...JSON.parse(stored) };
  } catch {
    // ignore
  }
  return DEFAULTS;
}

function write(prefs: SidebarPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    // Dispatch custom event so other components in same tab update
    window.dispatchEvent(new CustomEvent("sidebar-preferences-change"));
  } catch {
    // ignore
  }
}

let snapshot = read();

function subscribe(callback: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      snapshot = read();
      callback();
    }
  };
  const onCustom = () => {
    snapshot = read();
    callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("sidebar-preferences-change", onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("sidebar-preferences-change", onCustom);
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return DEFAULTS;
}

export function useSidebarPreferences(): [
  SidebarPreferences,
  (key: keyof SidebarPreferences, value: number | boolean) => void,
] {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback(
    (key: keyof SidebarPreferences, value: number | boolean) => {
      const next = { ...read(), [key]: value };
      snapshot = next;
      write(next);
    },
    [],
  );

  return [prefs, update];
}
