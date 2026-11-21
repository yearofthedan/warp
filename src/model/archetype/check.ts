/** What a resolved model reports before any rule runs: files no part claims where the unit denies loose files. */
import type { Finding } from '../rule.ts';
import type { Model } from './resolve.ts';

export const checkModel = (model: Model, { unclassifiedDocs }: { unclassifiedDocs?: string } = {}): Finding[] =>
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
          ...(unclassifiedDocs ? { docs: unclassifiedDocs } : {}),
        })),
  );
