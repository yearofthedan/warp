import type { ArchetypeRule, Rule } from '../rule.ts';
import { cognitiveComplexity } from './cognitive-complexity/cognitiveComplexity.ts';
import { dependencyDirectionByReach } from './dependency-direction/byReach.ts';
import { dependencyDirection } from './dependency-direction/dependencyDirection.ts';
import { functionCohesion } from './function-cohesion/functionCohesion.ts';
import { moduleCohesion } from './module-cohesion/moduleCohesion.ts';
import { noCrossKindReexport } from './no-cross-kind-reexport/noCrossKindReexport.ts';
import { noCrossUnitReexport } from './no-cross-unit-reexport/noCrossUnitReexport.ts';
import { noCycle } from './no-cycle/noCycle.ts';
import { noDoubleExport } from './no-double-export/noDoubleExport.ts';
import { unitCycle } from './unit-cycle/unitCycle.ts';
import { unitExternals } from './unit-externals/unitExternals.ts';

export const builtinRules: readonly Rule[] = [
  dependencyDirection,
  noCrossKindReexport,
  moduleCohesion,
  functionCohesion,
  cognitiveComplexity,
] as Rule[];

export const archetypeRules: readonly ArchetypeRule[] = [
  dependencyDirectionByReach,
  unitExternals,
  noDoubleExport,
  noCrossUnitReexport,
  noCycle,
  unitCycle,
  moduleCohesion,
  functionCohesion,
  cognitiveComplexity,
];
