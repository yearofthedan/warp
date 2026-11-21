import { join, relative, sep } from 'node:path';
import { API } from 'typescript/sync';
import type { Analyzer } from '../app/ports.ts';
import { type AnalysisScope, isExcluded } from '../model/config.ts';
import type { ModuleFacts, Project } from '../model/facts.ts';
import { importEdges, type Resolver } from './imports.ts';
import { countLines, readSource } from './source.ts';
import { functionFacts, moduleUnits } from './units.ts';

/** Builds the project model with the TypeScript 7 compiler API, which runs the native compiler in a child process. */
export const typescriptAnalyzer: Analyzer = {
  analyze(root: string, scope: AnalysisScope): Project {
    const api = new API({ cwd: root });
    try {
      const tsconfigs = [scope.tsconfig].flat().map((path) => join(root, path));
      const snapshot = api.createSnapshot({ openProjects: tsconfigs });
      const modules = new Map<string, ModuleFacts>();
      for (const tsconfig of tsconfigs) {
        const project = snapshot.getConfiguredProject(tsconfig);
        if (!project) throw new Error(`could not load ${tsconfig}`);
        for (const module of analyzeProgram(root, scope, project, modules)) modules.set(module.file, module);
      }
      if (modules.size === 0) throw new Error(`${tsconfigs.join(', ')} include no files to check`);
      return { modules: [...modules.values()] };
    } finally {
      api.close();
    }
  },
};

type Configured = NonNullable<ReturnType<ReturnType<API['createSnapshot']>['getConfiguredProject']>>;

/** The facts of a program's files that no earlier program covered. */
const analyzeProgram = (
  root: string,
  scope: AnalysisScope,
  { program, checker }: Configured,
  done: ReadonlyMap<string, ModuleFacts>,
): ModuleFacts[] => {
  const files = new Map<string, string>();
  for (const fileName of program.getSourceFileNames()) {
    const file = toRelative(root, fileName);
    if (file && !file.includes('node_modules/')) files.set(fileName, file);
  }
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
  const modules: ModuleFacts[] = [];
  for (const [fileName, file] of files) {
    if (done.has(file) || isExcluded(scope, file)) continue;
    const sourceFile = program.getSourceFile(fileName);
    if (!sourceFile) continue;
    const source = readSource(checker, sourceFile, file);
    modules.push({
      file,
      lines: countLines(sourceFile.text),
      imports: importEdges(source, resolver),
      units: moduleUnits(source),
      functions: functionFacts(source),
    });
  }
  return modules;
};

const toRelative = (root: string, fileName: string): string | undefined => {
  const path = relative(root, fileName);
  return path.startsWith('..') ? undefined : path.split(sep).join('/');
};
