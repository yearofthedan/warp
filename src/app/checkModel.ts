import type { Project } from '../model/facts.ts';
import type { Rule, Finding, ProjectContext } from '../rule/rule.ts';
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

type Shared = Omit<ProjectContext<object>, 'atFile' | 'atUnit'>;

const run = (rule: Rule, shared: Shared, settled: Settings): Finding[] => {
  if (rule.scope === 'project')
    return rule.check({
      ...shared,
      atFile: (file) => settled.atFile(file, rule.id, rule.defaults),
      atUnit: (unit) => settled.atUnit(unit, rule.id, rule.defaults),
    });
  return shared.project.modules.flatMap((module) => {
    const { on, options } = settled.atFile(module.file, rule.id, rule.defaults);
    return on ? rule.check({ module, options }) : [];
  });
};
