import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConfigError } from '../model/configError.ts';

export const configNames = ['warp.config.ts', 'warp.config.mts', 'warp.config.js', 'warp.config.mjs'];

export const findConfig = (dir: string): string => {
  const found = configNames.map((name) => join(dir, name)).find((file) => existsSync(file));
  if (!found) throw new ConfigError(`no config in ${dir}: add one of ${configNames.join(', ')}`);
  return found;
};

export interface LoadedConfig {
  raw: unknown;
  digest: string;
}

const entry = new URL(import.meta.url.endsWith('.ts') ? '../index.ts' : '../index.js', import.meta.url).href;
const ownFiles = new URL('../../', import.meta.url).href;

export const loadConfig = async (file: string): Promise<LoadedConfig> => {
  const digest = createHash('sha256');
  const hooks = registerHooks({
    resolve: (specifier, context, nextResolve) =>
      specifier === 'warp' ? { url: entry, shortCircuit: true } : nextResolve(specifier, context),
    load: (url, context, nextLoad) => {
      const loaded = nextLoad(url, context);
      if (url.startsWith('file:') && !url.startsWith(ownFiles)) digest.update(url).update(String(loaded.source ?? ''));
      return loaded;
    },
  });
  try {
    const module: Record<string, unknown> = await import(pathToFileURL(file).href);
    if (module.default === undefined) throw new ConfigError(`${file}: expected the config as its default export`);
    return { raw: module.default, digest: digest.digest('hex') };
  } finally {
    hooks.deregister();
  }
};
