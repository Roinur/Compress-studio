import type { CompressorSettings } from './types.js';

export const defaultSettings: CompressorSettings = {
  theme: 'dark',
  outputDir: '',
  argsTemplate: '',
  outputNameTemplate: '{name}-compressed.mp4',
  concurrency: 1,
  autoOpenOutput: false,
  autoAnswerPrompts: true,
  preferNvidia: true,
  desiredSizeMb: undefined,
  maxCompressionIterations: 3,
  keepCompletedLimit: 80
};
