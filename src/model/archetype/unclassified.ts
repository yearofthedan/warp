import type { Finding } from '../rule.ts';
import type { Model } from './resolve.ts';
import type { Settings } from './settings.ts';

export const unclassified = 'unclassified';

export const unclassifiedFindings = (model: Model, settled: Settings, docs: string | undefined): Finding[] =>
  model.units.flatMap((unit) =>
    (settled.decidedAt(unit, unclassified) ?? unit.parent === undefined)
      ? unit.looseFiles.map((file): Finding => ({
          rule: unclassified,
          key: `${unclassified}:${file}`,
          file,
          line: 1,
          value: 1,
          message:
            `${file} is in no part of ${unit.id} (${unit.archetype}), so nothing says what it may import. ` +
            `Add a files part to ${unit.archetype} that matches it, or move it into a part's folder.`,
          ...(docs ? { docs } : {}),
        }))
      : [],
  );
