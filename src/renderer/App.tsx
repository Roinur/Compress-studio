import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Archive,
  CheckCircle2,
  ChevronsRight,
  FolderOpen,
  Gauge,
  HardDrive,
  ListPlus,
  Minus,
  Moon,
  Settings,
  Square,
  Sun,
  Terminal,
  Trash2,
  UploadCloud,
  X,
  XCircle
} from 'lucide-react';
import { defaultSettings } from '../shared/profiles';
import type { BridgeApi, CompressJob, CompressorDiagnostics, CompressorSettings, JobStatus } from '../shared/types';
import './styles.css';

const studio = window.kompressStudio ?? createDemoBridge();

function createDemoBridge(): BridgeApi {
  let settings: CompressorSettings = { ...defaultSettings, outputDir: 'C:\\Users\\You\\Videos\\Compress Studio' };
  let jobs: CompressJob[] = [];
  const listeners = new Set<(jobs: CompressJob[]) => void>();
  const emit = () => listeners.forEach((listener) => listener(jobs));

  return {
    async getSettings() { return settings; },
    async saveSettings(next) { settings = next; return settings; },
    async chooseInputFiles() { return ['C:\\Demo\\clip-one.mp4', 'C:\\Demo\\screen-recording.mov']; },
    async chooseOutputDir() { return 'C:\\Demo\\Compressed'; },
    async chooseExecutable() { return 'C:\\Demo\\console.main.exe'; },
    async enqueueFiles(paths) {
      const now = new Date().toISOString();
      jobs = [
        ...paths.map((inputPath, index) => ({
          id: crypto.randomUUID(),
          inputPath,
          inputName: inputPath.split(/[\\/]/).pop() || inputPath,
          outputPath: `${settings.outputDir}\\demo-${index}.mp4`,
          status: 'queued' as const,
          progress: undefined,
          command: `ffmpeg.exe -i "${inputPath}" ...`,
          thumbnailUrl: index === 0 ? undefined : undefined,
          logs: [{ at: now, stream: 'system' as const, text: 'Demo job.' }]
        })),
        ...jobs
      ];
      emit();
      return jobs;
    },
    async startCompression() {
      jobs = jobs.map((job, index) => (
        job.status === 'queued' && index === 0
          ? { ...job, status: 'running' as const, progress: 42, startedAt: new Date().toISOString() }
          : job
      ));
      emit();
      return jobs;
    },
    async listJobs() { return jobs; },
    async cancelJob(jobId) {
      const job = jobs.find((item) => item.id === jobId);
      if (!job) throw new Error('Unknown job');
      job.status = 'cancelled';
      emit();
      return job;
    },
    async clearCompleted() {
      jobs = jobs.filter((job) => job.status === 'queued' || job.status === 'running');
      emit();
      return jobs;
    },
    async revealPath() {},
    async getDiagnostics(): Promise<CompressorDiagnostics> {
      return {
        platform: 'win32',
        packaged: false,
        appVersion: 'browser-preview',
        executablePath: settings.executablePath || 'node_modules\\ffmpeg-static\\ffmpeg.exe',
        executableAvailable: true,
        ffmpegPath: 'node_modules\\ffmpeg-static\\ffmpeg.exe',
        ffmpegAvailable: true,
        outputDir: settings.outputDir,
        nvidiaAvailable: true
      };
    },
    async minimizeWindow() {},
    async toggleMaximizeWindow() {},
    async closeWindow() {},
    onJobsChanged(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    }
  };
}

function statusLabel(status: JobStatus) {
  return {
    queued: 'Queued',
    running: 'Running',
    completed: 'Done',
    failed: 'Failed',
    cancelled: 'Cancelled'
  }[status];
}

function formatTime(value?: string) {
  return value ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)) : '';
}

function shortPath(value?: string) {
  if (!value) return '';
  const parts = value.split(/[\\/]/);
  return parts.length > 3 ? `...\\${parts.slice(-3).join('\\')}` : value;
}

function App() {
  const [settings, setSettings] = useState<CompressorSettings>({ ...defaultSettings });
  const [jobs, setJobs] = useState<CompressJob[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [diagnostics, setDiagnostics] = useState<CompressorDiagnostics | null>(null);
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);

  const selectedJob = jobs.find((job) => job.id === selectedId) ?? jobs[0];
  const activeJobs = jobs.filter((job) => job.status === 'running');
  const completedJobs = jobs.filter((job) => job.status === 'completed');
  const failedJobs = jobs.filter((job) => job.status === 'failed');
  const queuedJobs = jobs.filter((job) => job.status === 'queued');
  const completedSize = useMemo(() => jobs.filter((job) => job.status === 'completed').length, [jobs]);
  const compressState = activeJobs.length ? 'running' : queuedJobs.length ? 'ready' : 'empty';

  async function refresh() {
    const [nextSettings, nextJobs, nextDiagnostics] = await Promise.all([
      studio.getSettings(),
      studio.listJobs(),
      studio.getDiagnostics()
    ]);
    setSettings(nextSettings);
    setJobs(nextJobs);
    setDiagnostics(nextDiagnostics);
    if (!selectedId && nextJobs[0]) setSelectedId(nextJobs[0].id);
  }

  useEffect(() => {
    void refresh();
    return studio.onJobsChanged((nextJobs) => {
      setJobs(nextJobs);
      setSelectedId((current) => current || nextJobs[0]?.id || '');
    });
  }, []);

  async function updateSettings(patch: Partial<CompressorSettings>) {
    const next = await studio.saveSettings({ ...settings, ...patch });
    setSettings(next);
    setDiagnostics(await studio.getDiagnostics());
  }

  async function addFiles(paths?: string[]) {
    const selected = paths ?? await studio.chooseInputFiles();
    if (!selected.length) return;
    const nextJobs = await studio.enqueueFiles(selected);
    setJobs(nextJobs);
    setSelectedId(nextJobs[0]?.id || '');
    setNotice(`${selected.length} file${selected.length === 1 ? '' : 's'} added.`);
  }

  async function startCompression() {
    const nextJobs = await studio.startCompression();
    setJobs(nextJobs);
    setSelectedId((current) => current || nextJobs[0]?.id || '');
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const paths = [...event.dataTransfer.files]
      .map((file) => (file as File & { path?: string }).path)
      .filter((filePath): filePath is string => Boolean(filePath));
    void addFiles(paths);
  }

  async function chooseOutputDir() {
    const outputDir = await studio.chooseOutputDir();
    if (outputDir) await updateSettings({ outputDir });
  }

  async function chooseExecutable() {
    const executablePath = await studio.chooseExecutable();
    if (executablePath) await updateSettings({ executablePath });
  }

  async function toggleTheme() {
    await updateSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' });
  }

  return (
    <main className="appShell" data-theme={settings.theme}>
      <header className="appTitlebar">
        <div className="appMark" aria-hidden="true">
          <Archive size={18} />
        </div>
        <strong>Compress Studio</strong>
        <button className="themeButton" onClick={() => void toggleTheme()} title="Toggle dark/light mode">
          {settings.theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          {settings.theme === 'light' ? 'Dark' : 'Light'}
        </button>
        <div className="windowControls">
          <button type="button" title="Minimize" onClick={() => void studio.minimizeWindow()}><Minus size={15} /></button>
          <button type="button" title="Maximize" onClick={() => void studio.toggleMaximizeWindow()}><Square size={13} /></button>
          <button type="button" title="Close" className="closeButton" onClick={() => void studio.closeWindow()}><X size={15} /></button>
        </div>
      </header>

      <aside className="sidebar">
        <button
          className={`dropZone ${dragging ? 'dragging' : ''}`}
          onClick={() => void addFiles()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <UploadCloud size={28} />
          <strong>Add files</strong>
          <span>Drop videos or choose many at once</span>
        </button>

        <section className="sideSection">
          <div className="sideSectionTitle">Output</div>
          <button onClick={() => void chooseOutputDir()}><FolderOpen size={16} /> Choose folder</button>
          <code className="pathLine">{shortPath(settings.outputDir)}</code>
        </section>

        <section className="sideSection">
          <div className="sideSectionTitle">Engine</div>
          <code className={`pathLine ${diagnostics?.ffmpegAvailable ? '' : 'missing'}`}>
            {shortPath(diagnostics?.ffmpegPath)}
          </code>
        </section>

        <section className="sideSection settingsPanel">
          <div className="sideSectionTitle">Encoding</div>
          <label className="toggleRow">
            <span>Prefer Nvidia</span>
            <input type="checkbox" checked={settings.preferNvidia} onChange={(event) => void updateSettings({ preferNvidia: event.target.checked })} />
          </label>
          <label className="toggleRow">
            <span>Reveal when done</span>
            <input type="checkbox" checked={settings.autoOpenOutput} onChange={(event) => void updateSettings({ autoOpenOutput: event.target.checked })} />
          </label>
          <div className="sideSectionTitle advancedTitle">Advanced</div>
          <label>
            Extra ffmpeg args
            <input placeholder="Optional" value={settings.argsTemplate} onChange={(event) => void updateSettings({ argsTemplate: event.target.value })} />
          </label>
          <label>
            Output name
            <input value={settings.outputNameTemplate} onChange={(event) => void updateSettings({ outputNameTemplate: event.target.value })} />
          </label>
          <label>
            Desired size MB
            <input
              type="number"
              min={1}
              placeholder="Optional"
              value={settings.desiredSizeMb ?? ''}
              onChange={(event) => void updateSettings({ desiredSizeMb: event.target.value ? Number(event.target.value) : undefined })}
            />
          </label>
          <div className="settingsGrid">
            <label>
              Parallel
              <input type="number" min={1} max={4} value={settings.concurrency} onChange={(event) => void updateSettings({ concurrency: Number(event.target.value) })} />
            </label>
            <label>
              Max attempts
              <input type="number" min={1} max={10} value={settings.maxCompressionIterations} onChange={(event) => void updateSettings({ maxCompressionIterations: Number(event.target.value) })} />
            </label>
            <label>
              Keep
              <input type="number" min={10} max={500} value={settings.keepCompletedLimit} onChange={(event) => void updateSettings({ keepCompletedLimit: Number(event.target.value) })} />
            </label>
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbarTitleGroup">
            <div className="topbarTitleText">
              <h1>{activeJobs.length ? `${activeJobs.length} running` : 'Ready to compress'}</h1>
              <p>{queuedJobs.length} waiting, {completedJobs.length} finished, {failedJobs.length} failed</p>
            </div>
            <button
              className={`compressButton ${compressState}`}
              disabled={compressState !== 'ready'}
              onClick={() => void startCompression()}
            >
              <ChevronsRight size={18} />
              {compressState === 'running' ? 'Compressing' : compressState === 'ready' ? 'Compress' : 'No files'}
            </button>
          </div>
          <div className="topActions">
            <button onClick={() => void addFiles()}><ListPlus size={16} /> Add batch</button>
            <button disabled={!jobs.some((job) => ['completed', 'failed', 'cancelled'].includes(job.status))} onClick={() => void studio.clearCompleted()}>
              <Trash2 size={16} /> Clear done
            </button>
          </div>
        </header>

        {notice && <div className="notice">{notice}</div>}

        <div className="contentGrid">
          <section className="panel queuePanel">
            <div className="panelHeader">
              <h2><Gauge size={18} /> Queue</h2>
              <span className="summaryProgress">{completedSize} finished</span>
            </div>
            <div className="jobList">
              {jobs.length === 0 && (
                <div className="emptyState">
                  <strong>Waiting for files</strong>
                  <span>Add videos to begin.</span>
                </div>
              )}
              {jobs.map((job) => (
                <button key={job.id} className={`jobItem ${job.status} ${selectedJob?.id === job.id ? 'selected' : ''}`} onClick={() => setSelectedId(job.id)}>
                  <span className="jobThumb" aria-hidden="true">
                    {job.thumbnailUrl ? <img src={job.thumbnailUrl} alt="" /> : <Archive size={18} />}
                  </span>
                  <span className="jobMain">
                    <strong>{job.inputName}</strong>
                    <span>{statusLabel(job.status)} {job.startedAt ? `at ${formatTime(job.startedAt)}` : ''}</span>
                    <span className={`progressTrack ${job.status === 'running' && job.progress === undefined ? 'indeterminate' : ''}`}>
                      <i style={{ width: `${job.progress ?? 0}%` }} />
                    </span>
                  </span>
                  <span className={`jobMeta ${job.status}`}>
                    {job.status === 'completed' ? <CheckCircle2 size={17} /> : job.status === 'failed' ? <XCircle size={17} /> : job.progress !== undefined ? `${job.progress}%` : ''}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel detailPanel">
            <div className="panelHeader">
              <h2><Terminal size={18} /> Details</h2>
              {selectedJob && ['queued', 'running'].includes(selectedJob.status) && (
                <button onClick={() => void studio.cancelJob(selectedJob.id)}><X size={16} /> Cancel</button>
              )}
            </div>
            {selectedJob ? (
              <>
                <div className="detailStats">
                  <div><span>Status</span><strong>{statusLabel(selectedJob.status)}</strong></div>
                  <div><span>Progress</span><strong>{selectedJob.progress !== undefined ? `${selectedJob.progress}%` : 'Waiting'}</strong></div>
                  <div><span>Exit</span><strong>{selectedJob.exitCode ?? '-'}</strong></div>
                </div>
                <label>
                  Command
                  <pre className="commandBox">{selectedJob.command}</pre>
                </label>
                <div className="pathActions">
                  <button onClick={() => void studio.revealPath(selectedJob.inputPath)}><FolderOpen size={16} /> Input</button>
                  <button disabled={!selectedJob.outputPath} onClick={() => selectedJob.outputPath && void studio.revealPath(selectedJob.outputPath)}>
                    <FolderOpen size={16} /> Output
                  </button>
                </div>
                <div className="logList">
                  {selectedJob.logs.slice(-120).map((log, index) => (
                    <span key={`${log.at}-${index}`} className={log.stream}>
                      <em>{formatTime(log.at)}</em>{log.text}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="emptyState compact"><Settings size={32} /><strong>Select a job</strong></div>
            )}
          </section>
        </div>

        <footer className="statusBar">
          <span><HardDrive size={14} /> {diagnostics?.ffmpegAvailable ? 'Encoder ready' : 'Encoder missing'}</span>
          <span>{diagnostics?.nvidiaAvailable ? 'Nvidia detected' : 'CPU/other GPU'}</span>
          <span>Output: {shortPath(settings.outputDir)}</span>
          <span>v{diagnostics?.appVersion ?? 'dev'}</span>
          <span className="statusDot" />
        </footer>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
