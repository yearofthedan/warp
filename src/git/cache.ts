import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FindingsCache } from '../app/ports.ts';
import type { Finding } from '../rules/rule.ts';

export const maxAgeMs = 30 * 24 * 60 * 60 * 1000;

export const gitDirCache = (projectRoot: string, now: () => number = Date.now): FindingsCache => {
  const gitDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: projectRoot, encoding: 'utf8' }).trim();
  const dir = join(resolve(projectRoot, gitDir), 'warp-cache');
  const file = (key: string) => join(dir, `${key}.json`);
  const touch = (key: string) => {
    const time = new Date(now());
    utimesSync(file(key), time, time);
  };
  return {
    get(key) {
      try {
        const findings = JSON.parse(readFileSync(file(key), 'utf8')) as Finding[];
        touch(key);
        return findings;
      } catch {
        return undefined;
      }
    },
    set(key, findings) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file(key), JSON.stringify(findings));
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
