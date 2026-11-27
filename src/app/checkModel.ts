import type { Project } from '../domain/facts/facts.ts';
import type { Rule, Finding, ProjectContext } from '../domain/rules/rule.ts';
import type { ConfigData } from '../domain/model/data.ts';
import { verdicts } from '../domain/model/reach.ts';
import type { Model } from '../domain/model/resolve.ts';
import { settings, type Settings } from '../domain/model/settings.ts';

export const checkModel = (
  config: ConfigData,
  model: Model,
  project: Project,
  rules: readonly Rule[] = [],
): Finding[] => {
  const settled = settings(config, model);
  const judged = verdicts(config, model);
  const found = rules.flatMap((rule) => {
    const findings = run(rule, { project, config, model, verdicts: judged }, settled);
    return rule.docs ? findings.map((finding) => ({ ...finding, docs: rule.docs })) : findings;
  });
  return found.map((finding) => placed(model, finding));
};

const placed = (model: Model, finding: Finding): Finding => {
  const module = model.moduleOf(finding.file);
  if (!module) return finding;
  return { ...finding, module: module.id };
};

type Shared = Omit<ProjectContext<object>, 'atFile' | 'atModule'>;

const run = (rule: Rule, shared: Shared, settled: Settings): Finding[] => {
  if (rule.scope === 'project')
    return rule.check({
      ...shared,
      atFile: (file) => settled.atFile(file, rule.id, rule.defaults, rule.moduleOptions),
      atModule: (module) => settled.atModule(module, rule.id, rule.defaults, rule.moduleOptions),
    });
  return shared.project.files.flatMap((file) => {
    const { on, options } = settled.atFile(file.path, rule.id, rule.defaults, rule.moduleOptions);
    return on ? rule.check({ file, options }) : [];
  });
};
