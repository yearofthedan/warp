import type { Finding } from '../rules/rule.ts';
import type { Model } from '../model/archetype/resolve.ts';
import type { Settings } from '../model/archetype/settings.ts';

export const unclassified = 'unclassified';

export const unclassifiedFindings = (model: Model, settled: Settings, docs: string | undefined): Finding[] =>
  model.modules.flatMap((module) =>
    (settled.decidedAt(module, unclassified) ?? module.parent === undefined)
      ? module.looseFiles.map((file): Finding => ({
          rule: unclassified,
          key: `${unclassified}:${file}`,
          file,
          line: 1,
          value: 1,
          message:
            `${file} is in no part of ${module.id} (${module.archetype}), so nothing says what it may import. ` +
            `Add a files part to ${module.archetype} that matches it, or move it into a part's folder.`,
          ...(docs ? { docs } : {}),
        }))
      : [],
  );
