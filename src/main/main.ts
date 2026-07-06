import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { nanoid } from 'nanoid';
import { getSettings, saveSettings } from './settingsStore.js';
import type { CompressJob, CompressJobLogLine, CompressorSettings } from '../shared/types.js';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
const jobs: CompressJob[] = [];
const processes = new Map<string, ChildProcessWithoutNullStreams>();
let nvidiaGpuCache: boolean | undefined;

function iconPath() {
  return path.join(app.getAppPath(), 'assets', 'icon.ico');
}

function bundledCompressorPath() {
  return bundledFfmpegPath();
}

function bundledFfmpegPath() {
  const executable = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  if (app.isPackaged) {
    const unpackedPath = path.join(path.dirname(app.getAppPath()), 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', executable);
    if (fs.existsSync(unpackedPath)) return unpackedPath;
  }

  const npmPath = path.join(app.getAppPath(), 'node_modules', 'ffmpeg-static', executable);
  if (fs.existsSync(npmPath)) return npmPath;

  const base = app.isPackaged ? process.resourcesPath : app.getAppPath();
  const legacyVendorPath = path.join(base, 'vendor', executable);
  if (fs.existsSync(legacyVendorPath)) return legacyVendorPath;

  return executable;
}

function resolveCompressorPath(settings = getSettings()) {
  return settings.executablePath?.trim() || bundledCompressorPath();
}

function hasNvidiaGpu() {
  if (nvidiaGpuCache !== undefined) return nvidiaGpuCache;
  try {
    const output = execFileSync('nvidia-smi.exe', ['-L'], { encoding: 'utf8', windowsHide: true, timeout: 2500 });
    nvidiaGpuCache = /nvidia|gpu\s+\d+/i.test(output);
    return nvidiaGpuCache;
  } catch {
    try {
      const output = execFileSync('wmic.exe', ['path', 'win32_VideoController', 'get', 'name'], { encoding: 'utf8', windowsHide: true, timeout: 2500 });
      nvidiaGpuCache = /nvidia/i.test(output);
      return nvidiaGpuCache;
    } catch {
      nvidiaGpuCache = false;
      return false;
    }
  }
}

function quote(part: string) {
  return /^[A-Za-z0-9_./:=@-]+$/.test(part) ? part : `"${part.replaceAll('"', '\\"')}"`;
}

function splitArgs(template: string) {
  const result: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(template))) result.push(match[1] ?? match[2] ?? match[3]);
  return result;
}

function buildOutputPath(inputPath: string, settings: CompressorSettings) {
  const parsed = path.parse(inputPath);
  const cleanTemplate = settings.outputNameTemplate || '{name}-compressed{ext}';
  const fileName = cleanTemplate
    .replaceAll('{name}', parsed.name)
    .replaceAll('{ext}', parsed.ext)
    .replaceAll('{input}', parsed.base);
  return path.join(settings.outputDir, fileName);
}

function buildFfmpegArgs(inputPath: string, settings: CompressorSettings, outputPath: string, quality: number) {
  const executable = resolveCompressorPath(settings);
  const useNvenc = settings.preferNvidia && hasNvidiaGpu();
  const args = [
    '-hide_banner',
    '-y',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-sn',
    '-c:v',
    useNvenc ? 'h264_nvenc' : 'libx264',
    ...(useNvenc ? ['-preset', 'p5', '-cq', String(quality), '-b:v', '0'] : ['-preset', 'medium', '-crf', String(quality)]),
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    ...splitArgs(settings.argsTemplate ?? ''),
    outputPath
  ];
  return { executable, args, useNvenc };
}

function buildCommand(inputPath: string, settings: CompressorSettings) {
  const outputPath = buildOutputPath(inputPath, settings);
  const { executable, args } = buildFfmpegArgs(inputPath, settings, outputPath, 28);
  const command = [executable, ...args].map(quote).join(' ');
  return { executable, args, outputPath, command };
}

function thumbnailDir() {
  const dir = path.join(app.getPath('userData'), 'thumbs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function generateThumbnail(job: CompressJob) {
  const outputPath = path.join(thumbnailDir(), `${job.id}.jpg`);
  const child = spawn(bundledFfmpegPath(), [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    '00:00:01',
    '-i',
    job.inputPath,
    '-frames:v',
    '1',
    '-vf',
    'scale=160:-1',
    outputPath
  ], { windowsHide: true });

  child.on('close', (code) => {
    if (code === 0 && fs.existsSync(outputPath)) {
      job.thumbnailUrl = pathToFileURL(outputPath).toString();
      emitJobsChanged();
    }
  });
}

function addLog(job: CompressJob, stream: CompressJobLogLine['stream'], text: string) {
  const lines = text.replace(/\r/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    job.logs.push({ at: new Date().toISOString(), stream, text: line });
    const percent = line.match(/(?<!\d)(100|[1-9]?\d)(?:\.\d+)?\s?%/);
    if (percent && job.status === 'running') job.progress = Math.max(job.progress ?? 0, Math.min(100, Number(percent[1])));
  }
  job.logs = job.logs.slice(-600);
}

function parseDurationSeconds(text: string) {
  const match = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (!match) return undefined;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function parseFfmpegTimeSeconds(text: string) {
  const match = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (!match) return undefined;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function snapshotDir(dir: string) {
  try {
    return new Map(
      fs.readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => {
          const fullPath = path.join(dir, entry.name);
          return [fullPath, fs.statSync(fullPath).mtimeMs] as const;
        })
    );
  } catch {
    return new Map<string, number>();
  }
}

function findNewOutput(before: Map<string, number>, dir: string) {
  const after = snapshotDir(dir);
  const changed = [...after.entries()]
    .filter(([file, mtime]) => !before.has(file) || before.get(file) !== mtime)
    .sort((a, b) => b[1] - a[1]);
  return changed[0]?.[0];
}

function revealTarget(targetPath?: string, fallbackDir?: string) {
  if (targetPath && fs.existsSync(targetPath)) {
    void shell.showItemInFolder(targetPath);
    return;
  }
  if (fallbackDir && fs.existsSync(fallbackDir)) {
    void shell.openPath(fallbackDir);
  }
}

function emitJobsChanged() {
  const settings = getSettings();
  const completed = jobs.filter((job) => ['completed', 'failed', 'cancelled'].includes(job.status));
  if (completed.length > settings.keepCompletedLimit) {
    const keep = new Set(completed.slice(0, settings.keepCompletedLimit).map((job) => job.id));
    for (let index = jobs.length - 1; index >= 0; index -= 1) {
      const job = jobs[index];
      if (job && ['completed', 'failed', 'cancelled'].includes(job.status) && !keep.has(job.id)) jobs.splice(index, 1);
    }
  }
  mainWindow?.webContents.send('jobs:changed', jobs);
}

function pumpQueue() {
  const settings = getSettings();
  fs.mkdirSync(settings.outputDir, { recursive: true });
  const running = jobs.filter((job) => job.status === 'running').length;
  const capacity = Math.max(0, settings.concurrency - running);
  const queued = jobs.filter((job) => job.status === 'queued').slice(0, capacity);
  for (const job of queued) startJob(job, settings);
}

function tempAttemptPath(job: CompressJob, attempt: number) {
  return path.join(getSettings().outputDir, `.compress-${job.id}-attempt-${attempt}.mp4`);
}

function cleanupAttempts(job: CompressJob, keepPath?: string) {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const filePath = tempAttemptPath(job, attempt);
    if (filePath !== keepPath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Best-effort temp cleanup.
      }
    }
  }
}

function isCancelled(job: CompressJob) {
  return (job as CompressJob).status === 'cancelled';
}

function runFfmpegAttempt(
  job: CompressJob,
  settings: CompressorSettings,
  outputPath: string,
  quality: number,
  attempt: number,
  totalAttempts: number
) {
  return new Promise<number>((resolve, reject) => {
    const { executable, args } = buildFfmpegArgs(job.inputPath, settings, outputPath, quality);
    job.command = [executable, ...args].map(quote).join(' ');
    addLog(job, 'system', `Attempt ${attempt}/${totalAttempts}: quality ${quality}.`);
    emitJobsChanged();

    const child = spawn(executable, args, {
      cwd: settings.outputDir,
      windowsHide: true
    });
    let durationSeconds: number | undefined;
    processes.set(job.id, child);
    job.pid = child.pid;

    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      addLog(job, 'stdout', text);
      emitJobsChanged();
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      durationSeconds = durationSeconds ?? parseDurationSeconds(text);
      const currentSeconds = parseFfmpegTimeSeconds(text);
      if (durationSeconds && currentSeconds !== undefined) {
        const attemptProgress = Math.min(1, currentSeconds / durationSeconds);
        job.progress = Math.min(99, Math.round((((attempt - 1) + attemptProgress) / totalAttempts) * 99));
      }
      addLog(job, 'stderr', text);
      emitJobsChanged();
    });
    child.on('error', (error) => {
      processes.delete(job.id);
      reject(error);
    });
    child.on('close', (code) => {
      processes.delete(job.id);
      if (job.status === 'cancelled') {
        resolve(code ?? -1);
        return;
      }
      if (code === 0) {
        resolve(0);
      } else {
        reject(new Error(`Process exited with code ${code ?? 'unknown'}.`));
      }
    });
  });
}

async function runJob(job: CompressJob, settings: CompressorSettings) {
  const before = snapshotDir(settings.outputDir);
  const inputDir = path.dirname(job.inputPath);
  const beforeInputDir = inputDir === settings.outputDir ? before : snapshotDir(inputDir);
  const { outputPath } = buildCommand(job.inputPath, settings);
  const targetBytes = settings.desiredSizeMb && settings.desiredSizeMb > 0
    ? settings.desiredSizeMb * 1024 * 1024
    : undefined;
  const totalAttempts = targetBytes ? settings.maxCompressionIterations : 1;
  job.status = 'running';
  job.progress = 1;
  job.startedAt = new Date().toISOString();
  job.outputPath = outputPath;
  addLog(job, 'system', `Started ${path.basename(job.inputPath)}`);
  emitJobsChanged();

  try {
    let bestPath = '';
    let bestSize = Number.POSITIVE_INFINITY;
    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      const quality = Math.min(51, 28 + ((attempt - 1) * 5));
      const attemptPath = targetBytes ? tempAttemptPath(job, attempt) : outputPath;
      await runFfmpegAttempt(job, settings, attemptPath, quality, attempt, totalAttempts);
      if (isCancelled(job)) {
        cleanupAttempts(job);
        return;
      }

      const size = fs.existsSync(attemptPath) ? fs.statSync(attemptPath).size : Number.POSITIVE_INFINITY;
      bestPath = size < bestSize ? attemptPath : bestPath;
      bestSize = Math.min(bestSize, size);
      addLog(job, 'system', `Attempt ${attempt} output: ${(size / 1024 / 1024).toFixed(2)} MB.`);

      if (!targetBytes || size <= targetBytes) {
        bestPath = attemptPath;
        break;
      }
    }

    if (bestPath && bestPath !== outputPath) {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      fs.renameSync(bestPath, outputPath);
    }
    cleanupAttempts(job, outputPath);
    job.status = 'completed';
    job.progress = 100;
    job.outputPath = fs.existsSync(outputPath)
      ? outputPath
      : findNewOutput(before, settings.outputDir) ?? findNewOutput(beforeInputDir, inputDir) ?? outputPath;
    if (targetBytes && bestSize > targetBytes) {
      addLog(job, 'system', `Closest result after ${totalAttempts} attempts: ${(bestSize / 1024 / 1024).toFixed(2)} MB.`);
    } else {
      addLog(job, 'system', 'Completed.');
    }
    if (settings.autoOpenOutput) revealTarget(job.outputPath, settings.outputDir);
  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : String(error);
    job.progress = undefined;
    if (/h264_nvenc|nvenc/i.test(job.logs.map((line) => line.text).join('\n')) && settings.preferNvidia) {
      addLog(job, 'system', 'NVENC failed. Turn off Prefer Nvidia to retry with CPU/x264.');
    }
    addLog(job, 'stderr', job.error);
    cleanupAttempts(job);
  } finally {
    job.completedAt = new Date().toISOString();
    emitJobsChanged();
    pumpQueue();
  }
}

function startJob(job: CompressJob, settings: CompressorSettings) {
  void runJob(job, settings);
}

function enqueueFiles(paths: string[]) {
  const settings = getSettings();
  const nextJobs = paths
    .filter((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile())
    .map((inputPath): CompressJob => {
      const built = buildCommand(inputPath, settings);
      return {
        id: nanoid(),
        inputPath,
        inputName: path.basename(inputPath),
        outputPath: built.outputPath,
        status: 'queued',
        command: built.command,
        logs: [{ at: new Date().toISOString(), stream: 'system', text: 'Queued.' }]
      };
    });
  jobs.unshift(...nextJobs);
  emitJobsChanged();
  for (const job of nextJobs) generateThumbnail(job);
  return jobs;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    title: 'Compress Studio',
    frame: false,
    icon: iconPath(),
    backgroundColor: '#0d0d0d',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist', 'main', 'main', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.on('close', () => {
    isQuitting = true;
  });

  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (!app.isPackaged) {
    void mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    void mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'renderer', 'index.html'));
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:save', (_, settings: CompressorSettings) => {
    const saved = saveSettings(settings);
    for (const job of jobs.filter((item) => item.status === 'queued')) {
      const built = buildCommand(job.inputPath, saved);
      job.outputPath = built.outputPath;
      job.command = built.command;
    }
    emitJobsChanged();
    return saved;
  });
  ipcMain.handle('files:choose-input', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose files to compress',
      properties: ['openFile', 'multiSelections']
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('files:choose-output', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose output folder',
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle('files:choose-executable', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose compressor executable',
      filters: [{ name: 'Executable', extensions: ['exe'] }],
      properties: ['openFile']
    });
    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle('jobs:enqueue', (_, paths: string[]) => enqueueFiles(paths));
  ipcMain.handle('jobs:start', () => {
    pumpQueue();
    return jobs;
  });
  ipcMain.handle('jobs:list', () => jobs);
  ipcMain.handle('jobs:cancel', (_, jobId: string) => {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) throw new Error(`Unknown job ${jobId}`);
    if (job.status === 'queued') {
      job.status = 'cancelled';
      job.completedAt = new Date().toISOString();
    } else if (job.status === 'running') {
      job.status = 'cancelled';
      job.completedAt = new Date().toISOString();
      processes.get(jobId)?.kill();
    }
    emitJobsChanged();
    if (jobs.some((item) => item.status === 'running')) pumpQueue();
    return job;
  });
  ipcMain.handle('jobs:clear-completed', () => {
    for (let index = jobs.length - 1; index >= 0; index -= 1) {
      const job = jobs[index];
      if (job && ['completed', 'failed', 'cancelled'].includes(job.status)) jobs.splice(index, 1);
    }
    emitJobsChanged();
    return jobs;
  });
  ipcMain.handle('path:reveal', (_, targetPath: string) => {
    revealTarget(targetPath, getSettings().outputDir);
  });
  ipcMain.handle('diagnostics:get', () => {
    const settings = getSettings();
    const executablePath = resolveCompressorPath(settings);
    const ffmpegPath = bundledFfmpegPath();
    return {
      platform: process.platform,
      packaged: app.isPackaged,
      appVersion: app.getVersion(),
      executablePath,
      executableAvailable: fs.existsSync(executablePath) || executablePath === 'ffmpeg' || executablePath === 'ffmpeg.exe',
      ffmpegPath,
      ffmpegAvailable: fs.existsSync(ffmpegPath) || ffmpegPath === 'ffmpeg' || ffmpegPath === 'ffmpeg.exe',
      outputDir: settings.outputDir,
      nvidiaAvailable: hasNvidiaGpu()
    };
  });
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  for (const child of processes.values()) child.kill();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
