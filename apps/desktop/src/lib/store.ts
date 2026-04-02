import Store from "electron-store";

interface StoreSchema {
  serverUrl: string;
  windowBounds: {
    x?: number;
    y?: number;
    width: number;
    height: number;
  };
  startMinimized: boolean;
}

const isDev = process.env.NODE_ENV === "development";

export const store = new Store<StoreSchema>({
  schema: {
    serverUrl: {
      type: "string",
      default: isDev ? "http://localhost:3000" : "http://localhost:3001",
    },
    windowBounds: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number", default: 1280 },
        height: { type: "number", default: 800 },
      },
      default: { width: 1280, height: 800 },
    },
    startMinimized: {
      type: "boolean",
      default: false,
    },
  },
});

// In dev, always use the Vite dev server (ignore any persisted URL)
if (isDev) {
  store.set("serverUrl", "http://localhost:3000");
}
