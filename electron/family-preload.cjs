const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("blueyFamily", {
  request: (path, token, body, method) =>
    ipcRenderer.invoke("family-request", path, token, body, method),
  guardianStatus: () => ipcRenderer.invoke("guardian-status"),
  openGuardianSetup: () => ipcRenderer.invoke("guardian-setup"),
  openSetupGuide: () => ipcRenderer.invoke("guardian-guide"),
  vaultRead: () => ipcRenderer.invoke("kids-vault", "read"),
  vaultWrite: ({ token }) => ipcRenderer.invoke("kids-vault", "write", token),
  vaultClear: () => ipcRenderer.invoke("kids-vault", "clear"),
});
