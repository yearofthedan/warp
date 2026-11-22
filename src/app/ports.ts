import type { Folders } from '../model/archetype/resolve.ts';
import type { ModuleFacts, Project } from '../model/facts.ts';
import type { Finding } from '../rules/rule.ts';

export interface Analyzer {
  analyze(root: string, tsconfig: readonly string[], facts?: FactsStore): Project;
}

export type FoldersAt = (root: string) => Folders;

export interface Repository {
  projectPath(): string;
  commit(ref: string): string;
  mergeBase(a: string, b: string): string;
  checkout(commit: string, requiredFile: string): { projectRoot?: string; dispose(): void };
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
  facts?: ModuleFacts;
}
