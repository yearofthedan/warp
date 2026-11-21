import type { ConfigData } from '../model/archetype/data.ts';
import { checkModel } from '../model/archetype/check.ts';
import { type Model, resolveModel } from '../model/archetype/resolve.ts';
import { check } from '../model/check.ts';
import { alwaysExcluded, type Config } from '../model/config.ts';
import type { Project } from '../model/facts.ts';
import type { Finding } from '../model/rule.ts';
import type { Analyzer, FoldersAt } from './ports.ts';

/** How a config checks a project directory: the working tree's, or a commit's checkout. */
export interface ProjectCheck {
  /** The config as resolved, part of diff's cache key. */
  config: unknown;
  /** A file a commit's checkout must have for the project to exist there. */
  requiredFile: string;
  check(root: string): Finding[];
}

export const checkProject = (analyzer: Analyzer, root: string, config: Config): Finding[] =>
  check(config, analyzer.analyze(root, { tsconfig: config.tsconfig, exclude: config.exclude }));

export const kindsCheck = (analyzer: Analyzer, config: Config): ProjectCheck => ({
  config,
  requiredFile: config.tsconfig,
  check: (root) => checkProject(analyzer, root, config),
});

/** The units an archetype config finds in a project, with the facts of the files they hold. */
export const modelProject = (
  { analyzer, foldersAt }: { analyzer: Analyzer; foldersAt: FoldersAt },
  root: string,
  config: ConfigData,
): { model: Model; project: Project } => {
  const project = analyzer.analyze(root, { tsconfig: config.tsconfig, exclude: alwaysExcluded });
  const files = project.modules.map((module) => module.file);
  return { model: resolveModel(config, foldersAt(root), files), project };
};

export const archetypeCheck = (
  adapters: { analyzer: Analyzer; foldersAt: FoldersAt },
  config: ConfigData,
  options: { unclassifiedDocs?: string } = {},
): ProjectCheck => ({
  config,
  requiredFile: config.tsconfig[0]!,
  check: (root) => checkModel(modelProject(adapters, root, config).model, options),
});
