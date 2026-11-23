import type { Project } from '../model/facts.ts';
import type { Rule, Finding, ProjectContext } from '../rules/rule.ts';
import type { ConfigData } from '../model/archetype/data.ts';
import { verdicts } from '../model/archetype/reach.ts';
import type { Model } from '../model/archetype/resolve.ts';
import { settings, type Settings } from '../model/archetype/settings.ts';
import { unclassifiedFindings } from './unclassified.ts';

export const checkModel = (
  config: ConfigData,
  model: Model,
  project: Project,
  rules: readonly Rule[] = [],
  unclassifiedDocs?: string,
): Finding[] => {
  const settled = settings(config, model);
  const judged = verdicts(config, model);
  const found = rules.flatMap((rule) => {
    const findings = run(rule, { project, config, model, verdicts: judged }, settled);
    return rule.docs ? findings.map((finding) => ({ ...finding, docs: rule.docs })) : findings;
  });
  return [...unclassifiedFindings(model, settled, unclassifiedDocs), ...found];
};

type Shared = Omit<ProjectContext<object>, 'atFile' | 'atModule'>;

const run = (rule: Rule, shared: Shared, settled: Settings): Finding[] => {
  if (rule.scope === 'project')
    return rule.check({
      ...shared,
      atFile: (file) => settled.atFile(file, rule.id, rule.defaults),
      atModule: (module) => settled.atModule(module, rule.id, rule.defaults),
    });
  return shared.project.files.flatMap((file) => {
    const { on, options } = settled.atFile(file.path, rule.id, rule.defaults);
    return on ? rule.check({ file, options }) : [];
  });
};
