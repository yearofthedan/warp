import type { Project } from '../facts.ts';
import type { Finding } from '../rule.ts';
import { fileCycleFindings, unitCycleFindings } from './cycles.ts';
import type { ConfigData } from './data.ts';
import { directionFindings } from './direction.ts';
import { externalFindings } from './externals.ts';
import { inlineFindings } from './inline.ts';
import { verdicts } from './reach.ts';
import { reexportFindings } from './reexports.ts';
import type { Model } from './resolve.ts';
import { settings } from './settings.ts';

export interface CheckDocs {
  unclassified?: string;
  'dependency-direction'?: string;
  'unit-externals'?: string;
  'no-private-reexport'?: string;
  'unit-cycle'?: string;
  'no-cycle'?: string;
}

export const checkModel = (config: ConfigData, model: Model, project: Project, docs: CheckDocs = {}): Finding[] => {
  const rules = settings(config, model);
  const judged = verdicts(config, model);
  const onFiles = [
    ...directionFindings(config, model, judged, project, docs['dependency-direction']),
    ...externalFindings(model, judged, project, docs['unit-externals']),
    ...reexportFindings(config, model, judged, project, docs['no-private-reexport']),
    ...inlineFindings(config, model, judged, project),
    ...fileCycleFindings(project, rules, docs['no-cycle']),
  ];
  return [
    ...unclassifiedFindings(model, docs.unclassified),
    ...onFiles.filter((finding) => rules.atFile(finding.file, finding.rule).on),
    ...unitCycleFindings(model, project, rules, docs['unit-cycle']),
  ];
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
