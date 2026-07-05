import Store from 'electron-store';
import path from 'node:path';
import type { CompressorSettings } from '../shared/types.js';
import { defaultSettings } from '../shared/profiles.js';

const store = new Store<CompressorSettings>({
  name: 'compress-studio',
  defaults: defaultSettings
});

export function getSettings(): CompressorSettings {
  const settings = store.store;
  const defaultOutputDir = path.join(process.env.USERPROFILE || process.cwd(), 'Videos', 'Compress Studio');
  const argsTemplate = settings.argsTemplate === '"{input}"' ? '' : settings.argsTemplate;
  const outputNameTemplate = settings.outputNameTemplate === '{name}-compressed{ext}'
    ? defaultSettings.outputNameTemplate
    : settings.outputNameTemplate;
  return {
    ...defaultSettings,
    ...settings,
    theme: settings.theme ?? defaultSettings.theme,
    outputDir: settings.outputDir || defaultOutputDir,
    argsTemplate: argsTemplate ?? defaultSettings.argsTemplate,
    outputNameTemplate: outputNameTemplate || defaultSettings.outputNameTemplate,
    concurrency: Math.max(1, Math.min(settings.concurrency || 1, 4)),
    autoAnswerPrompts: settings.autoAnswerPrompts ?? true,
    preferNvidia: settings.preferNvidia ?? true,
    desiredSizeMb: settings.desiredSizeMb && settings.desiredSizeMb > 0 ? settings.desiredSizeMb : undefined,
    maxCompressionIterations: Math.max(1, Math.min(settings.maxCompressionIterations || 3, 10)),
    keepCompletedLimit: Math.max(10, Math.min(settings.keepCompletedLimit || 80, 500))
  };
}

export function saveSettings(settings: CompressorSettings): CompressorSettings {
  store.store = {
    ...getSettings(),
    ...settings,
    theme: settings.theme ?? 'dark',
    outputDir: settings.outputDir?.trim() || defaultSettings.outputDir,
    argsTemplate: settings.argsTemplate?.trim() ?? defaultSettings.argsTemplate,
    outputNameTemplate: settings.outputNameTemplate?.trim() || defaultSettings.outputNameTemplate,
    concurrency: Math.max(1, Math.min(Number(settings.concurrency) || 1, 4)),
    autoAnswerPrompts: settings.autoAnswerPrompts ?? true,
    preferNvidia: settings.preferNvidia ?? true,
    desiredSizeMb: Number(settings.desiredSizeMb) > 0 ? Number(settings.desiredSizeMb) : undefined,
    maxCompressionIterations: Math.max(1, Math.min(Number(settings.maxCompressionIterations) || 3, 10)),
    keepCompletedLimit: Math.max(10, Math.min(Number(settings.keepCompletedLimit) || 80, 500))
  };
  return getSettings();
}
