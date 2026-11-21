import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Folders } from '../model/archetype/resolve.ts';

/** Folders that hold no units: hidden ones and installed packages. */
const skipped = (name: string): boolean => name.startsWith('.') || name === 'node_modules';

/** The folders under `root`, read from the disk as resolution asks for them. */
export const diskFolders = (root: string): Folders => ({
  folders: (dir) => {
    const path = join(root, dir);
    if (!existsSync(path)) return [];
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !skipped(entry.name))
      .map((entry) => entry.name)
      .sort();
  },
  exists: (path) => existsSync(join(root, path)),
});
