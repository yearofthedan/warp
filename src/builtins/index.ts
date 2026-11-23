import { registry } from '../rules/registry.ts';
import type { Rule } from '../rules/rule.ts';
import { cognitiveComplexity } from './cognitive-complexity/cognitiveComplexity.ts';
import { dependencyDirection } from './dependency-direction/dependencyDirection.ts';
import { functionCohesion } from './function-cohesion/functionCohesion.ts';
import { fileCohesion } from './file-cohesion/fileCohesion.ts';
import { noCrossUnitReexport } from './no-cross-unit-reexport/noCrossUnitReexport.ts';
import { noCycle } from './no-cycle/noCycle.ts';
import { noDoubleExport } from './no-double-export/noDoubleExport.ts';
import { unitCycle } from './unit-cycle/unitCycle.ts';
import { unitExternals } from './unit-externals/unitExternals.ts';

export const builtinRules: readonly Rule[] = [
  dependencyDirection,
  unitExternals,
  noDoubleExport,
  noCrossUnitReexport,
  noCycle,
  unitCycle,
  fileCohesion,
  functionCohesion,
  cognitiveComplexity,
];

const source = 'https://github.com/yearofthedan/warp/blob/main';

const documented = (rule: Rule): Rule => ({
  ...rule,
  docs: `${source}/src/builtins/${rule.id}/README.md`,
});

export const builtinRegistry = registry(builtinRules.map(documented));

export const unclassifiedDocs = `${source}/src/builtins/unclassified/README.md`;
