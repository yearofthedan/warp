import { createHash } from 'node:crypto';
import { anchorAtChange, type Delta, diff } from '../domain/rules/diff.ts';
import type { Finding, Site } from '../domain/rules/rule.ts';
import type { ProjectCheck } from './check.ts';
import type { ChangedLines, FindingsCache, Repository } from './ports.ts';

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
  sinceLastRun?: boolean;
}

const changedAt =
  (lines: readonly ChangedLines[]) =>
  ({ file, line }: Site): boolean =>
    lines.some((range) => range.file === file && range.from <= line && line <= range.to);

type Ports = { repository: Repository; cache: FindingsCache };

const baseOf = ({ base, head, fromMergeBase }: Range, repository: Repository): string =>
  fromMergeBase ? repository.mergeBase(base, head ?? 'HEAD') : base;

export const diffProject = (request: DiffRequest, ports: Ports): Delta =>
  anchorAtChange(compareProject(request, ports), () =>
    changedAt(ports.repository.changedLines(baseOf(request.range, ports.repository), request.range.head)),
  );

const compareProject = (
  { range, root, project, configDigest = '', toolDigest, sinceLastRun = false }: DiffRequest,
  { repository, cache }: Ports,
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
  if (sinceLastRun && head !== undefined)
    throw new InvalidRange('a diff since the last run compares the working tree, so its range takes no <head>');
  const baseFindings = () => atCommit(baseOf(range, repository));
  if (head !== undefined) return diff(baseFindings(), atCommit(head));
  const current = project.check(root);
  if (!sinceLastRun) return diff(baseFindings(), current);
  const worktree = `${toolDigest}-${configHash}-last-run-${createHash('sha256').update(root).digest('hex').slice(0, 16)}-`;
  const lastRunKey = `${worktree}${repository.commit('HEAD')}`;
  const delta = diff(cache.get(lastRunKey) ?? baseFindings(), current);
  cache.set(lastRunKey, current);
  cache.prune((key) => key === lastRunKey || !key.startsWith(worktree));
  return delta;
};
