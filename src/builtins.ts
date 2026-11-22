import { registry } from './model/registry.ts';
import type { Rule } from './model/rule.ts';
import { builtinRules } from './model/rules/index.ts';

const source = 'https://github.com/yearofthedan/warp/blob/main';

const documented = (rule: Rule): Rule => ({
  ...rule,
  docs: `${source}/src/model/rules/${rule.id}/README.md`,
});

export const builtinRegistry = registry(builtinRules.map(documented));

export const unclassifiedDocs = `${source}/src/model/rules/unclassified/README.md`;
