import 'left-pad';
import { join } from 'node:path';
import { readFile } from 'fs/promises';
import type { Plugin } from '@scope/tool/plugin';
import { type Config, defineConfig } from 'virtual:config';
import { Square } from './lib/index.ts';

export { parse } from 'yaml';

export const load = (path: string): [Square, Plugin, Config] => [join(path), readFile, defineConfig] as never;
