import { registry } from './rule/registry.ts';
import type { Rule } from './rule/rule.ts';
import { builtinRules } from './rules/index.ts';

const source = 'https://github.com/yearofthedan/warp/blob/main';

const documented = (rule: Rule): Rule => ({
  ...rule,
  docs: `${source}/src/rules/${rule.id}/README.md`,
});

export const builtinRegistry = registry(builtinRules.map(documented));

export const unclassifiedDocs = `${source}/src/rules/unclassified/README.md`;
