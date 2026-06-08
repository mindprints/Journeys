'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  newProject:     () => ipcRenderer.invoke('project:new'),
  openProject:    () => ipcRenderer.invoke('project:open'),
  saveAsProject:  () => ipcRenderer.invoke('project:saveAs'),
  getProjectName: () => ipcRenderer.invoke('project:name'),
  getApiKeys:     () => ipcRenderer.invoke('settings:get-keys'),
  saveApiKeys:    (keys) => ipcRenderer.invoke('settings:save-keys', keys),
});
