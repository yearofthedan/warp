import type { Cache } from './ports.ts';

export interface Failures {
  isNew(problem: string): boolean;
  forget(): void;
}

export const failures = (cache: Cache<string> | undefined, toolDigest: string): Failures => {
  const key = `${toolDigest}-failure`;
  return {
    isNew(problem) {
      if (cache?.get(key) === problem) return false;
      cache?.set(key, problem);
      return true;
    },
    forget() {
      if (cache?.get(key) !== undefined) cache.prune((other) => other !== key);
    },
  };
};
