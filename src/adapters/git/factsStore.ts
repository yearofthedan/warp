import type { Cache, CachedFacts, FactsStore } from '../../app/ports.ts';

export const factsStore = (cache: Cache<CachedFacts>, toolDigest: string, projectPath: string): FactsStore => {
  const key = `${toolDigest}-facts-${projectPath.replaceAll('/', '_')}`;
  return {
    read: () => cache.get(key),
    write(facts) {
      cache.set(key, facts);
      cache.prune((other) => other.startsWith(`${toolDigest}-`));
    },
  };
};
