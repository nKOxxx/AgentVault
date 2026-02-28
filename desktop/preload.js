const { contextBridge, ipcRenderer } = require('electron');

// Expose secure APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Vault operations
  vaultStatus: () => ipcRenderer.invoke('vault-status'),
  vaultInit: (data) => ipcRenderer.invoke('vault-init', data),
  vaultUnlock: (data) => ipcRenderer.invoke('vault-unlock', data),
  vaultLock: () => ipcRenderer.invoke('vault-lock'),
  
  // Key operations
  keysList: () => ipcRenderer.invoke('keys-list'),
  keysAdd: (data) => ipcRenderer.invoke('keys-add', data),
  keysDelete: (data) => ipcRenderer.invoke('keys-delete', data),
  keysGet: (data) => ipcRenderer.invoke('keys-get', data),
  keysEdit: (data) => ipcRenderer.invoke('keys-edit', data),
  keysShare: (data) => ipcRenderer.invoke('keys-share', data),
  keysUnshare: (data) => ipcRenderer.invoke('keys-unshare', data),
  
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Event listeners
  onVaultAutoLocked: (callback) => ipcRenderer.on('vault-auto-locked', callback),
});
