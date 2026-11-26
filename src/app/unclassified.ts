import type { Finding } from '../domain/rules/rule.ts';
import type { Model } from '../domain/model/resolve.ts';
import type { Settings } from '../domain/model/settings.ts';

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
            `${file} is in no module of ${module.parent ? `${module.id} (${module.archetype})` : 'the root'}, so nothing says what it may import. ` +
            `Add a files module to ${module.archetype} that matches it, or move it into a module's folder.`,
          ...(docs ? { docs } : {}),
        }))
      : [],
  );
