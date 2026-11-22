import type { Project } from '../facts.ts';
import type { ArchetypeRule, Finding, ProjectContext } from '../rule.ts';
import type { ConfigData } from './data.ts';
import { inlineFindings } from './inline.ts';
import { verdicts } from './reach.ts';
import type { Model } from './resolve.ts';
import { settings, type Settings } from './settings.ts';

export const checkModel = (
  config: ConfigData,
  model: Model,
  project: Project,
  rules: readonly ArchetypeRule[] = [],
  unclassifiedDocs?: string,
): Finding[] => {
  const settled = settings(config, model);
  const judged = verdicts(config, model);
  const found = rules.flatMap((rule) => {
    const findings = run(rule, { project, config, model, verdicts: judged }, settled);
    return rule.docs ? findings.map((finding) => ({ ...finding, docs: rule.docs })) : findings;
  });
  return [
    ...unclassifiedFindings(model, unclassifiedDocs),
    ...found,
    ...inlineFindings(config, model, judged, project).filter(
      (finding) => settled.atFile(finding.file, finding.rule).on,
    ),
  ];
};

type Shared = Omit<ProjectContext<object>, 'atFile' | 'atUnit'>;

const run = (rule: ArchetypeRule, shared: Shared, settled: Settings): Finding[] => {
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

const unclassifiedFindings = (model: Model, docs: string | undefined): Finding[] =>
  model.units.flatMap((unit) =>
    unit.loose !== 'deny'
      ? []
      : unit.looseFiles.map((file): Finding => ({
          rule: 'unclassified',
          key: `unclassified:${file}`,
          file,
          line: 1,
          value: 1,
          message:
            `${file} is in no part of ${unit.id} (${unit.archetype}), so nothing says what it may import. ` +
            `Add a files part to ${unit.archetype} that matches it, or move it into a part's folder.`,
          ...(docs ? { docs } : {}),
        })),
  );
