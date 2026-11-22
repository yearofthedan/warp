import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { API } from 'typescript/sync';
import { freshFacts } from '../app/facts.ts';
import type { Analyzer, CachedFile } from '../app/ports.ts';
import type { ModuleFacts } from '../model/facts.ts';
import { moduleEdges, type Resolver } from './imports.ts';
import { moduleSpecifiers } from './specifiers.ts';
import { countLines, readSource } from './source.ts';
import { functionFacts, moduleUnits } from './units.ts';

type Snapshot = ReturnType<API['createSnapshot']>;
type Configured = NonNullable<ReturnType<Snapshot['getConfiguredProject']>>;

export const typescriptAnalyzer: Analyzer = {
  analyze(root, tsconfig, store) {
    const api = new API({ cwd: root });
    try {
      const tsconfigs = tsconfig.map((path) => join(root, path));
      const snapshot = api.createSnapshot({ openProjects: tsconfigs });
      const projects = tsconfigs.map((path) => {
        const project = snapshot.getConfiguredProject(path);
        if (!project) throw new Error(`could not load ${path}`);
        return { project, files: projectFiles(root, project) };
      });
      const hashes = new Map(
        projects.flatMap(({ files }) => [...files.values()].map((file) => [file, hashOf(root, file)])),
      );
      const digest = digestOf(root, projects);
      const fresh = freshFacts(store?.read(), { digest, hashes });
      const cached = new Map<string, Omit<CachedFile, 'hash'>>();
      for (const { project, files } of projects)
        for (const [file, entry] of analyzeProgram(project, files, fresh, cached)) cached.set(file, entry);
      const modules = [...cached.values()].flatMap(({ facts }) => (facts ? [facts] : []));
      if (modules.length === 0) throw new Error(`${tsconfigs.join(', ')} include no files to check`);
      const files = [...hashes].map(([file, hash]) => [file, { ...cached.get(file), hash }]);
      store?.write({ digest, files: Object.fromEntries(files) });
      return { modules };
    } finally {
      api.close();
    }
  },
};

const projectFiles = (root: string, { program }: Configured): Map<string, string> => {
  const files = new Map<string, string>();
  for (const fileName of program.getSourceFileNames()) {
    const file = toRelative(root, fileName);
    if (file && !file.includes('node_modules/')) files.set(fileName, file);
  }
  return files;
};

const hashOf = (root: string, file: string): string =>
  createHash('sha256')
    .update(readFileSync(join(root, file)))
    .digest('hex')
    .slice(0, 16);

const digestOf = (root: string, projects: readonly { project: Configured; files: ReadonlyMap<string, string> }[]) => {
  const digest = createHash('sha256');
  const own = (path: string) => path.split(root).join('.');
  for (const { project, files } of projects) {
    digest.update(own(JSON.stringify(project.program.getCompilerOptions())));
    for (const fileName of project.program.getSourceFileNames()) {
      if (files.has(fileName)) continue;
      const { size, mtimeMs } = statSync(fileName);
      digest.update(`${own(fileName)}\0${size}\0${mtimeMs}\0`);
    }
  }
  return digest.digest('hex').slice(0, 16);
};

const analyzeProgram = (
  { program, checker }: Configured,
  files: ReadonlyMap<string, string>,
  fresh: ReadonlyMap<string, Omit<CachedFile, 'hash'>>,
  done: ReadonlyMap<string, unknown>,
): Map<string, Omit<CachedFile, 'hash'>> => {
  const byPath = new Map(
    [...files].flatMap(([fileName, file]) => [
      [fileName, file],
      [fileName.toLowerCase(), file],
    ]),
  );
  const resolver: Resolver = {
    program,
    checker,
    relative: (path) => byPath.get(path) ?? byPath.get(path.toLowerCase()),
  };
  const analyzed = new Map<string, Omit<CachedFile, 'hash'>>();
  for (const [fileName, file] of files) {
    if (done.has(file) || file.endsWith('.d.ts')) continue;
    const reused = fresh.get(file);
    if (reused) {
      analyzed.set(file, reused);
      continue;
    }
    const sourceFile = program.getSourceFile(fileName);
    if (!sourceFile) continue;
    const source = readSource(checker, sourceFile, file);
    const facts: ModuleFacts = {
      file,
      lines: countLines(sourceFile.text),
      ...moduleEdges(source, resolver),
      units: moduleUnits(source),
      functions: functionFacts(source),
    };
    analyzed.set(file, { specifiers: moduleSpecifiers(sourceFile), facts });
  }
  return analyzed;
};

const toRelative = (root: string, fileName: string): string | undefined => {
  const path = relative(root, fileName);
  return path.startsWith('..') ? undefined : path.split(sep).join('/');
};
