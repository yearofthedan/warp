import { createHash } from 'node:crypto';
import { type Delta, diff } from '../rules/diff.ts';
import type { Finding } from '../rules/rule.ts';
import type { ProjectCheck } from './check.ts';
import type { FindingsCache, Repository } from './ports.ts';

export interface Range {
  base: string;
  head?: string;
  fromMergeBase: boolean;
}

export class InvalidRange extends Error {}

export const parseRange = (range: string): Range => {
  const match = /^(.+?)(\.\.\.|\.\.)(.*)$/.exec(range);
  const [base, separator, head] = match ? match.slice(1) : [range, '', ''];
  if (!base || base.includes('..') || head.includes('..'))
    throw new InvalidRange(`${range} is not a range: expected <base>, <base>..<head> or <base>...<head>`);
  return { base, ...(head ? { head } : {}), fromMergeBase: separator === '...' };
};

export interface DiffRequest {
  range: Range;
  root: string;
  project: ProjectCheck;
  configDigest?: string;
  toolDigest: string;
}

export const diffProject = (
  { range, root, project, configDigest = '', toolDigest }: DiffRequest,
  { repository, cache }: { repository: Repository; cache: FindingsCache },
): Delta => {
  const configHash = createHash('sha256')
    .update(JSON.stringify(project.config))
    .update(configDigest)
    .digest('hex')
    .slice(0, 16);
  const atCommit = (ref: string): Finding[] => {
    const commit = repository.commit(ref);
    const key = `${toolDigest}-${configHash}-${commit}-${repository.projectPath().replaceAll('/', '_')}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const checkout = repository.checkout(commit, project.requiredFile);
    try {
      const findings = checkout.projectRoot ? project.check(checkout.projectRoot) : [];
      cache.set(key, findings);
      cache.prune((other) => other.startsWith(`${toolDigest}-`));
      return findings;
    } finally {
      checkout.dispose();
    }
  };
  const { head } = range;
  const base = range.fromMergeBase ? repository.mergeBase(range.base, head ?? 'HEAD') : range.base;
  return diff(atCommit(base), head === undefined ? project.check(root) : atCommit(head));
};
