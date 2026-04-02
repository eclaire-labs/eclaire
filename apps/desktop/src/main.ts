import path from "node:path";
import { app, globalShortcut, ipcMain } from "electron";
import { handleDeepLink, registerDeepLinks } from "./lib/deep-links.js";
import { store } from "./lib/store.js";
import { createTray, destroyTray } from "./lib/tray.js";
import { initAutoUpdater } from "./lib/updater.js";
import { createMainWindow, getMainWindow } from "./lib/window.js";

// Set app name (shown in dock, alt-tab, etc.)
app.name = "Eclaire";
if (process.platform === "darwin") {
  app.setName("Eclaire");
}

// Ensure single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
    // Handle deep link from second instance (Windows/Linux)
    const deepLinkUrl = argv.find((arg) => arg.startsWith("eclaire://"));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
    }
  });
}

// Handle deep link on macOS
app.on("open-url", (_event, url) => {
  handleDeepLink(url);
});

// ---------- Health check ----------

async function checkServerHealth(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${url}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

// ---------- IPC handlers ----------

ipcMain.handle("get-app-version", () => app.getVersion());

ipcMain.handle("get-server-url", () => store.get("serverUrl"));

ipcMain.handle("set-server-url", (_event, url: string) => {
  store.set("serverUrl", url);
});

ipcMain.handle("connect-to-server", async () => {
  const url = store.get("serverUrl");
  const healthy = await checkServerHealth(url);
  if (healthy) {
    const win = getMainWindow();
    if (win) {
      win.loadURL(url);
    }
    return { success: true };
  }
  return { success: false, error: "Could not reach server" };
});

// ---------- App lifecycle ----------

app.whenReady().then(async () => {
  registerDeepLinks();

  const win = createMainWindow();
  const serverUrl = store.get("serverUrl");
  const healthy = await checkServerHealth(serverUrl);

  if (healthy) {
    win.loadURL(serverUrl);
  } else {
    // Show connection setup screen
    const connectHtmlPath = path.join(import.meta.dirname, "connect.html");
    win.loadFile(connectHtmlPath);
  }

  createTray();
  initAutoUpdater();

  // Global shortcut to focus the app
  globalShortcut.register("CmdOrCtrl+Shift+E", () => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.show();
      mainWin.focus();
    }
  });

  // macOS: re-create window when dock icon is clicked
  app.on("activate", () => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.show();
    } else {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    destroyTray();
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  destroyTray();
});
