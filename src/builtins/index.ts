import { registry } from '../domain/rules/registry.ts';
import type { Rule } from '../domain/rules/rule.ts';
import { cognitiveComplexity } from './cognitive-complexity/rule.ts';
import { dependencyDirection } from './dependency-direction/rule.ts';
import { fileCohesion } from './file-cohesion/rule.ts';
import { functionCohesion } from './function-cohesion/rule.ts';
import { moduleCycle } from './module-cycle/rule.ts';
import { moduleExternals } from './module-externals/rule.ts';
import { noCrossModuleReexport } from './no-cross-module-reexport/rule.ts';
import { noCycle } from './no-cycle/rule.ts';
import { noDoubleExport } from './no-double-export/rule.ts';
import { unresolvedImport } from './unresolved-import/rule.ts';
import { unusedDeclaration } from './unused-declaration/rule.ts';

export const builtinRules: readonly Rule[] = [
  unresolvedImport,
  dependencyDirection,
  moduleExternals,
  noDoubleExport,
  noCrossModuleReexport,
  noCycle,
  moduleCycle,
  fileCohesion,
  functionCohesion,
  cognitiveComplexity,
  unusedDeclaration,
];

const source = 'https://github.com/yearofthedan/warp/blob/main';

const documented = (rule: Rule): Rule => ({
  ...rule,
  docs: `${source}/src/builtins/${rule.id}/README.md`,
});

export const builtinRegistry = registry(builtinRules.map(documented));

export const unclassifiedDocs = `${source}/src/builtins/unclassified/README.md`;
