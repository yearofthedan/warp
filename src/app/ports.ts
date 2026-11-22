import type { Folders } from '../model/archetype/resolve.ts';
import type { Project } from '../model/facts.ts';
import type { Finding } from '../rule/rule.ts';

export interface Analyzer {
  analyze(root: string, tsconfig: readonly string[]): Project;
}

export type FoldersAt = (root: string) => Folders;

export interface Repository {
  projectPath(): string;
  commit(ref: string): string;
  mergeBase(a: string, b: string): string;
  checkout(commit: string, requiredFile: string): { projectRoot?: string; dispose(): void };
}

export interface FindingsCache {
  get(key: string): Finding[] | undefined;
  set(key: string, findings: Finding[]): void;
  prune(keep: (key: string) => boolean): void;
}
