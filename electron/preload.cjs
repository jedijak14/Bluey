const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("bluey", {
  connection: () => ipcRenderer.invoke("connection"),
  window: (action) => ipcRenderer.send("window-action", action),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  onCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("command", listener);
    return () => ipcRenderer.removeListener("command", listener);
  },
  chooseFolder: () => ipcRenderer.invoke("choose-folder"),
  interactive: (value) =>
    ipcRenderer.send("overlay-interactive", Boolean(value)),
  onPointer: (callback) => {
    const listener = (_event, point) => callback(point);
    ipcRenderer.on("pointer", listener);
    return () => ipcRenderer.removeListener("pointer", listener);
  },
});
