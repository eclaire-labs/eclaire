import { useCallback, useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "sidebar-collapsed";
const DEFAULT = false;

function read(): boolean {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
  } catch {
    // ignore
  }
  return DEFAULT;
}

function write(collapsed: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
    window.dispatchEvent(new CustomEvent("sidebar-collapsed-change"));
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
  window.addEventListener("sidebar-collapsed-change", onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("sidebar-collapsed-change", onCustom);
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return DEFAULT;
}

export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setCollapsed = useCallback((next: boolean) => {
    snapshot = next;
    write(next);
  }, []);

  return [collapsed, setCollapsed];
}

/** Registers Cmd+B / Ctrl+B to toggle sidebar collapsed state. */
export function useSidebarCollapseShortcut(
  collapsed: boolean,
  setCollapsed: (collapsed: boolean) => void,
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "b" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        setCollapsed(!collapsed);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [collapsed, setCollapsed]);
}
