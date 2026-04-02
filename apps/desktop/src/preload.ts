import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("eclaire", {
  platform: process.platform,
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getServerUrl: () => ipcRenderer.invoke("get-server-url"),
  setServerUrl: (url: string) => ipcRenderer.invoke("set-server-url", url),
  connectToServer: () => ipcRenderer.invoke("connect-to-server"),
});
