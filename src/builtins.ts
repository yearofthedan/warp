import { registry } from './model/registry.ts';
import type { ArchetypeRule, Rule } from './model/rule.ts';
import { archetypeRules, builtinRules } from './model/rules/index.ts';

const source = 'https://github.com/yearofthedan/warp/blob/main';

const documented = <R extends Rule | ArchetypeRule>(rule: R): R => ({
  ...rule,
  docs: `${source}/src/model/rules/${rule.id}/README.md`,
});

export const builtinRegistry = registry(builtinRules.map(documented));

export const archetypeRegistry = registry(archetypeRules.map(documented));

export const unclassifiedDocs = `${source}/src/model/rules/unclassified/README.md`;
