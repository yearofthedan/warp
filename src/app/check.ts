import type { ConfigData } from '../model/archetype/data.ts';
import { checkModel } from './checkModel.ts';
import { type Model, resolveModel } from '../model/archetype/resolve.ts';
import type { Project } from '../model/facts.ts';
import type { Finding, Rule } from '../rules/rule.ts';
import type { Analyzer, FactsStore, FoldersAt } from './ports.ts';

export interface ProjectCheck {
  config: unknown;
  requiredFile: string;
  check(root: string): Finding[];
}

export interface Adapters {
  analyzer: Analyzer;
  foldersAt: FoldersAt;
  facts?: FactsStore;
}

export const modelProject = (
  { analyzer, foldersAt, facts }: Adapters,
  root: string,
  config: ConfigData,
): { model: Model; project: Project } => {
  const project = analyzer.analyze(root, config.tsconfig, facts);
  const files = project.modules.map((module) => module.file);
  return { model: resolveModel(config, foldersAt(root), files), project };
};

export const projectCheck = (
  adapters: Adapters,
  config: ConfigData,
  { rules = [], unclassifiedDocs }: { rules?: readonly Rule[]; unclassifiedDocs?: string } = {},
): ProjectCheck => ({
  config,
  requiredFile: config.tsconfig[0]!,
  check: (root) => {
    const { model, project } = modelProject(adapters, root, config);
    return checkModel(config, model, project, rules, unclassifiedDocs);
  },
});
