import type { ConfigData } from '../model/archetype/data.ts';
import { type CheckDocs, checkModel } from '../model/archetype/check.ts';
import { type Model, resolveModel } from '../model/archetype/resolve.ts';
import { check } from '../model/check.ts';
import { alwaysExcluded, type Config } from '../model/config.ts';
import type { Project } from '../model/facts.ts';
import type { Finding } from '../model/rule.ts';
import type { Analyzer, FoldersAt } from './ports.ts';

export interface ProjectCheck {
  config: unknown;
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
  docs: CheckDocs = {},
): ProjectCheck => ({
  config,
  requiredFile: config.tsconfig[0]!,
  check: (root) => {
    const { model, project } = modelProject(adapters, root, config);
    return checkModel(config, model, project, docs);
  },
});
