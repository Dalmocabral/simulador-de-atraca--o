const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onSplashUpdate: (callback) => {
    ipcRenderer.on("splash-update", (_event, value) => callback(value));
  },
  syncPraticagem: () => ipcRenderer.invoke("sync-praticagem"),
});
