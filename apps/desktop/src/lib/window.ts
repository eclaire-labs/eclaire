import path from "node:path";
import { BrowserWindow, nativeImage, shell } from "electron";
import { store } from "./store.js";

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function createMainWindow(): BrowserWindow {
  const bounds = store.get("windowBounds");

  const iconPath = path.join(
    import.meta.dirname,
    "..",
    "resources",
    process.platform === "win32" ? "icon.ico" : "icon.png",
  );

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 800,
    minHeight: 600,
    title: "Eclaire",
    icon: nativeImage.createFromPath(iconPath),
    titleBarStyle: process.platform === "darwin" ? "hidden" : "default",
    ...(process.platform === "darwin" && {
      trafficLightPosition: { x: -20, y: -20 },
    }),
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      partition: "persist:eclaire",
    },
    show: false,
  });

  // Inject a draggable title-bar region into every page (needed for hiddenInset)
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow?.webContents.insertCSS(`
      body::before {
        content: "";
        display: block;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 40px;
        -webkit-app-region: drag;
        z-index: 9999;
        pointer-events: none;
      }
      /* Ensure clickable elements in the top bar still work */
      button, a, input, select, textarea, [role="button"], [role="menuitem"] {
        -webkit-app-region: no-drag;
      }
    `);
  });

  // Show when ready to avoid flash of white
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Save window bounds on resize/move
  const saveBounds = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [x, y] = mainWindow.getPosition();
      const [width, height] = mainWindow.getSize();
      store.set("windowBounds", { x, y, width, height });
    }
  };
  mainWindow.on("resize", saveBounds);
  mainWindow.on("move", saveBounds);

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // macOS: hide window instead of quitting when closed
  if (process.platform === "darwin") {
    mainWindow.on("close", (event) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        event.preventDefault();
        mainWindow.hide();
      }
    });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}
