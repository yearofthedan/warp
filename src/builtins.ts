import { registry } from './model/config.ts';
import type { Rule } from './model/rule.ts';
import { builtinRules } from './model/rules/index.ts';

const source = 'https://github.com/yearofthedan/warp/blob/main';

const documented = (rule: Rule): Rule => ({ ...rule, docs: `${source}/src/model/rules/${rule.id}/README.md` });

export const builtinRegistry = registry(builtinRules.map(documented));

export const unclassifiedDocs = `${source}/docs/unclassified.md`;

// why: an archetype config's rules run outside the registry, so their pages are listed by hand.
// until: archetype rules run through the registry, in the rules port
export const archetypeDocs = {
  unclassified: unclassifiedDocs,
  'dependency-direction': builtinRegistry.get('dependency-direction')?.docs,
  'unit-cycle': `${source}/docs/unit-cycle.md`,
  'no-cycle': `${source}/docs/no-cycle.md`,
};
