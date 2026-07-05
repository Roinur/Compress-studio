import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outDir = path.resolve('dist/main/main');
await mkdir(outDir, { recursive: true });

await writeFile(
  path.join(outDir, 'preload.cjs'),
  `const { contextBridge, ipcRenderer } = require('electron');

const api = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  chooseInputFiles: () => ipcRenderer.invoke('files:choose-input'),
  chooseOutputDir: () => ipcRenderer.invoke('files:choose-output'),
  chooseExecutable: () => ipcRenderer.invoke('files:choose-executable'),
  enqueueFiles: (paths) => ipcRenderer.invoke('jobs:enqueue', paths),
  startCompression: () => ipcRenderer.invoke('jobs:start'),
  listJobs: () => ipcRenderer.invoke('jobs:list'),
  cancelJob: (jobId) => ipcRenderer.invoke('jobs:cancel', jobId),
  clearCompleted: () => ipcRenderer.invoke('jobs:clear-completed'),
  revealPath: (targetPath) => ipcRenderer.invoke('path:reveal', targetPath),
  getDiagnostics: () => ipcRenderer.invoke('diagnostics:get'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onJobsChanged: (callback) => {
    const listener = (_, jobs) => callback(jobs);
    ipcRenderer.on('jobs:changed', listener);
    return () => ipcRenderer.off('jobs:changed', listener);
  }
};

contextBridge.exposeInMainWorld('kompressStudio', api);
`,
  'utf8'
);
