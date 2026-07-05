export type Theme = 'dark' | 'light';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface CompressJobLogLine {
  at: string;
  stream: 'stdout' | 'stderr' | 'system';
  text: string;
}

export interface CompressJob {
  id: string;
  inputPath: string;
  inputName: string;
  thumbnailUrl?: string;
  outputPath?: string;
  status: JobStatus;
  progress?: number;
  pid?: number;
  command: string;
  startedAt?: string;
  completedAt?: string;
  exitCode?: number | null;
  error?: string;
  logs: CompressJobLogLine[];
}

export interface CompressorSettings {
  theme: Theme;
  executablePath?: string;
  outputDir: string;
  argsTemplate: string;
  outputNameTemplate: string;
  concurrency: number;
  autoOpenOutput: boolean;
  autoAnswerPrompts: boolean;
  preferNvidia: boolean;
  desiredSizeMb?: number;
  maxCompressionIterations: number;
  keepCompletedLimit: number;
}

export interface CompressorDiagnostics {
  platform: NodeJS.Platform;
  packaged: boolean;
  appVersion: string;
  executablePath: string;
  executableAvailable: boolean;
  ffmpegPath: string;
  ffmpegAvailable: boolean;
  outputDir: string;
  nvidiaAvailable: boolean;
}

export interface BridgeApi {
  getSettings(): Promise<CompressorSettings>;
  saveSettings(settings: CompressorSettings): Promise<CompressorSettings>;
  chooseInputFiles(): Promise<string[]>;
  chooseOutputDir(): Promise<string | undefined>;
  chooseExecutable(): Promise<string | undefined>;
  enqueueFiles(paths: string[]): Promise<CompressJob[]>;
  startCompression(): Promise<CompressJob[]>;
  listJobs(): Promise<CompressJob[]>;
  cancelJob(jobId: string): Promise<CompressJob>;
  clearCompleted(): Promise<CompressJob[]>;
  revealPath(path: string): Promise<void>;
  getDiagnostics(): Promise<CompressorDiagnostics>;
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  onJobsChanged(callback: (jobs: CompressJob[]) => void): () => void;
}
