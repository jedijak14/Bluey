const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("bluey", {
  connection: () => ipcRenderer.invoke("connection"),
  window: (action) => ipcRenderer.send("window-action", action),
  chooseFolder: () => ipcRenderer.invoke("choose-folder"),
  interactive: (value) =>
    ipcRenderer.send("overlay-interactive", Boolean(value)),
  onPointer: (callback) => {
    const listener = (_event, point) => callback(point);
    ipcRenderer.on("pointer", listener);
    return () => ipcRenderer.removeListener("pointer", listener);
  },
});
