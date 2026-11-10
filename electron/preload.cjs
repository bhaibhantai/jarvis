const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('jarvisDesktop', {
  hasApiKey: () => ipcRenderer.invoke('jarvis:key-status'),
  saveApiKey: (key) => ipcRenderer.invoke('jarvis:save-key', key),
  openSettings: () => ipcRenderer.invoke('jarvis:open-settings'),
})
