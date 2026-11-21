/**
 * What an archetype config reports on a project: files no part claims where the unit denies loose files, and imports
 * outside the importer's reach.
 */
import type { Project } from '../facts.ts';
import type { Finding } from '../rule.ts';
import type { ConfigData } from './data.ts';
import { directionFindings } from './direction.ts';
import { verdicts } from './reach.ts';
import type { Model } from './resolve.ts';

/** Each finding's docs page, by rule id. */
export interface CheckDocs {
  unclassified?: string;
  'dependency-direction'?: string;
}

export const checkModel = (config: ConfigData, model: Model, project: Project, docs: CheckDocs = {}): Finding[] => [
  ...unclassifiedFindings(model, docs.unclassified),
  ...directionFindings(config, model, verdicts(config, model), project, docs['dependency-direction']),
];

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
