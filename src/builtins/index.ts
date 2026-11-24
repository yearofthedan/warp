import { registry } from '../rules/registry.ts';
import type { Rule } from '../rules/rule.ts';
import { cognitiveComplexity } from './cognitive-complexity/cognitiveComplexity.ts';
import { dependencyDirection } from './dependency-direction/dependencyDirection.ts';
import { fileCohesion } from './file-cohesion/fileCohesion.ts';
import { functionCohesion } from './function-cohesion/functionCohesion.ts';
import { moduleCycle } from './module-cycle/moduleCycle.ts';
import { moduleExternals } from './module-externals/moduleExternals.ts';
import { noCrossModuleReexport } from './no-cross-module-reexport/noCrossModuleReexport.ts';
import { noCycle } from './no-cycle/noCycle.ts';
import { noDoubleExport } from './no-double-export/noDoubleExport.ts';
import { unresolvedImport } from './unresolved-import/unresolvedImport.ts';
import { unusedDeclaration } from './unused-declaration/unusedDeclaration.ts';

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
