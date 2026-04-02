import { app } from "electron";
import { store } from "./store.js";
import { getMainWindow } from "./window.js";

const PROTOCOL = "eclaire";

export function registerDeepLinks(): void {
  if (process.defaultApp) {
    // In development, register the protocol with the path to electron
    if (process.argv[1]) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
        process.argv[1],
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

export function handleDeepLink(url: string): void {
  // Parse eclaire://open/notes/123 → /notes/123
  const parsed = new URL(url);
  const pathSegments = parsed.pathname.replace(/^\/+/, "");

  if (parsed.host === "open" && pathSegments) {
    const win = getMainWindow();
    if (win) {
      const serverUrl = store.get("serverUrl");
      win.loadURL(`${serverUrl}/${pathSegments}`);
      win.show();
      win.focus();
    }
  }
}
