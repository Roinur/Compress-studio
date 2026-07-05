import { contextBridge, ipcRenderer } from 'electron';
import type { BridgeApi, CompressJob, CompressorSettings } from '../shared/types.js';

const api: BridgeApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: CompressorSettings) => ipcRenderer.invoke('settings:save', settings),
  chooseInputFiles: () => ipcRenderer.invoke('files:choose-input'),
  chooseOutputDir: () => ipcRenderer.invoke('files:choose-output'),
  chooseExecutable: () => ipcRenderer.invoke('files:choose-executable'),
  enqueueFiles: (paths: string[]) => ipcRenderer.invoke('jobs:enqueue', paths),
  startCompression: () => ipcRenderer.invoke('jobs:start'),
  listJobs: () => ipcRenderer.invoke('jobs:list'),
  cancelJob: (jobId: string) => ipcRenderer.invoke('jobs:cancel', jobId),
  clearCompleted: () => ipcRenderer.invoke('jobs:clear-completed'),
  revealPath: (targetPath: string) => ipcRenderer.invoke('path:reveal', targetPath),
  getDiagnostics: () => ipcRenderer.invoke('diagnostics:get'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onJobsChanged: (callback: (jobs: CompressJob[]) => void) => {
    const listener = (_: Electron.IpcRendererEvent, jobs: CompressJob[]) => callback(jobs);
    ipcRenderer.on('jobs:changed', listener);
    return () => ipcRenderer.off('jobs:changed', listener);
  }
};

contextBridge.exposeInMainWorld('kompressStudio', api);
