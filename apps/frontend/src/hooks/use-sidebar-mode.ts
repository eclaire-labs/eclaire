import { useCallback, useEffect, useSyncExternalStore } from "react";

export type SidebarMode = "content" | "ai";

const STORAGE_KEY = "sidebar-mode";
const DEFAULT: SidebarMode = "content";

function read(): SidebarMode {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "content" || stored === "ai") return stored;
  } catch {
    // ignore
  }
  return DEFAULT;
}

function write(mode: SidebarMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
    window.dispatchEvent(new CustomEvent("sidebar-mode-change"));
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
  window.addEventListener("sidebar-mode-change", onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("sidebar-mode-change", onCustom);
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return DEFAULT;
}

export function useSidebarMode(): [SidebarMode, (mode: SidebarMode) => void] {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setMode = useCallback((next: SidebarMode) => {
    snapshot = next;
    write(next);
  }, []);

  return [mode, setMode];
}

/** Registers Cmd+Shift+E / Ctrl+Shift+E to toggle sidebar mode. */
export function useSidebarModeShortcut(
  mode: SidebarMode,
  setMode: (mode: SidebarMode) => void,
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "e" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setMode(mode === "content" ? "ai" : "content");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, setMode]);
}
