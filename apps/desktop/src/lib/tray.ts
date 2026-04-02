import path from "node:path";
import { app, Menu, nativeImage, Tray } from "electron";
import { store } from "./store.js";
import { getMainWindow } from "./window.js";

let tray: Tray | null = null;

export function createTray(): void {
  const iconPath = path.join(
    import.meta.dirname,
    "..",
    "resources",
    "icon.png",
  );
  const icon = nativeImage
    .createFromPath(iconPath)
    .resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip("Eclaire");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Eclaire",
      click: () => {
        const win = getMainWindow();
        if (win) {
          win.show();
          win.focus();
        }
      },
    },
    {
      label: `Server: ${store.get("serverUrl")}`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Quit Eclaire",
      click: () => {
        // Force quit — bypass the macOS close-to-hide behavior
        const win = getMainWindow();
        if (win) {
          win.destroy();
        }
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    const win = getMainWindow();
    if (win) {
      if (win.isVisible()) {
        win.focus();
      } else {
        win.show();
      }
    }
  });
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
