import pkg from "electron-updater";

const { autoUpdater } = pkg;

import { getMainWindow } from "./window.js";

export function initAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    console.log(`Update available: ${info.version}`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`Update downloaded: ${info.version}`);
    const win = getMainWindow();
    if (win) {
      win.webContents.send("update-downloaded", info.version);
    }
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-updater error:", err.message);
  });

  // Check for updates on launch and every 4 hours
  autoUpdater.checkForUpdates().catch(() => {
    // Silently ignore — update server may not be configured yet
  });

  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch(() => {});
    },
    4 * 60 * 60 * 1000,
  );
}
