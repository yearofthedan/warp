import type { Folders } from '../domain/model/resolve.ts';
import type { FileFacts, Project } from '../domain/facts/facts.ts';
import type { Finding } from '../domain/rules/rule.ts';

export interface Analyzer {
  analyze(root: string, tsconfig: readonly string[], facts?: FactsStore): Project;
}

export type FoldersAt = (root: string) => Folders;

export interface Repository {
  projectPath(): string;
  commit(ref: string): string;
  mergeBase(a: string, b: string): string;
  changedLines(base: string, head?: string): ChangedLines[];
  checkout(commit: string, requiredFile: string): { projectRoot?: string; dispose(): void };
}

export interface ChangedLines {
  file: string;
  from: number;
  to: number;
}

export interface Cache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  prune(keep: (key: string) => boolean): void;
}

export type FindingsCache = Cache<Finding[]>;

export interface FactsStore {
  read(): CachedFacts | undefined;
  write(facts: CachedFacts): void;
}

export interface CachedFacts {
  digest: string;
  files: Record<string, CachedFile>;
}

export interface CachedFile {
  hash: string;
  specifiers?: string[];
  facts?: FileFacts;
}
