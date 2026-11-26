import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Cache } from '../../app/ports.ts';

export const maxAgeMs = 30 * 24 * 60 * 60 * 1000;

export const gitDirCache = <T>(projectRoot: string, now: () => number = Date.now): Cache<T> => {
  const gitDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const dir = join(resolve(projectRoot, gitDir), 'warp-cache');
  const file = (key: string) => join(dir, `${key}.json`);
  const touch = (key: string) => {
    const time = new Date(now());
    utimesSync(file(key), time, time);
  };
  return {
    get(key) {
      try {
        const value = JSON.parse(readFileSync(file(key), 'utf8')) as T;
        touch(key);
        return value;
      } catch {
        return undefined;
      }
    },
    set(key, value) {
      mkdirSync(dir, { recursive: true });
      const partial = `${file(key)}.${process.pid}`;
      writeFileSync(partial, JSON.stringify(value));
      renameSync(partial, file(key));
      touch(key);
    },
    prune(keep) {
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.json')) continue;
        const path = join(dir, name);
        if (!keep(name.slice(0, -'.json'.length)) || now() - statSync(path).mtimeMs > maxAgeMs)
          rmSync(path, { force: true });
      }
    },
  };
};
