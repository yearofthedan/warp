import type { LoadOptions } from './model/archetype/load.ts';
import { registry } from './model/config.ts';
import { type ArchetypeRule, noOptions, type Rule } from './model/rule.ts';
import { archetypeRules, builtinRules } from './model/rules/index.ts';

const source = 'https://github.com/yearofthedan/warp/blob/main';

const documented = <R extends Rule | ArchetypeRule>(rule: R): R => ({
  ...rule,
  docs: `${source}/src/model/rules/${rule.id}/README.md`,
});

export const builtinRegistry = registry(builtinRules.map(documented));

export const archetypeRegistry = registry(archetypeRules.map(documented));

export const unclassifiedDocs = `${source}/src/model/rules/unclassified/README.md`;

export const archetypeLoadOptions: LoadOptions = {
  ruleIds: [...archetypeRegistry.keys()],
  options: Object.fromEntries([...archetypeRegistry].map(([id, rule]) => [id, rule.parseOptions ?? noOptions])),
};
