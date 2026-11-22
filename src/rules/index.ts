import type { Rule } from '../rule/rule.ts';
import { cognitiveComplexity } from './cognitive-complexity/cognitiveComplexity.ts';
import { dependencyDirection } from './dependency-direction/dependencyDirection.ts';
import { functionCohesion } from './function-cohesion/functionCohesion.ts';
import { moduleCohesion } from './module-cohesion/moduleCohesion.ts';
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
  moduleCohesion,
  functionCohesion,
  cognitiveComplexity,
];
