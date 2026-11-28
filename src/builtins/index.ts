import { registry } from '../domain/rules/registry.ts';
import type { Plugin, Rule, RulesetDefinition } from '../domain/rules/rule.ts';
import { classCohesion } from './class-cohesion/rule.ts';
import { cognitiveComplexity } from './cognitive-complexity/rule.ts';
import { exportConsumers } from './export-consumers/rule.ts';
import { exportSpread } from './export-spread/rule.ts';
import { exportSurface } from './export-surface/rule.ts';
import { dependencyDirection } from './dependency-direction/rule.ts';
import { fileCohesion } from './file-cohesion/rule.ts';
import { functionCohesion } from './function-cohesion/rule.ts';
import { moduleDependencies } from './module-dependencies/rule.ts';
import { moduleSize } from './module-size/rule.ts';
import { moduleCycle } from './module-cycle/rule.ts';
import { moduleExternals } from './module-externals/rule.ts';
import { noCrossModuleReexport } from './no-cross-module-reexport/rule.ts';
import { noCycle } from './no-cycle/rule.ts';
import { noDoubleExport } from './no-double-export/rule.ts';
import { packageSpread } from './package-spread/rule.ts';
import { unclassified } from './unclassified/rule.ts';
import { unresolvedImport } from './unresolved-import/rule.ts';
import { unusedDeclaration } from './unused-declaration/rule.ts';

const ruleClasses = {
  boundaries: [
    unclassified,
    unresolvedImport,
    dependencyDirection,
    moduleExternals,
    noDoubleExport,
    noCrossModuleReexport,
    noCycle,
    moduleCycle,
    unusedDeclaration,
  ],
  cohesion: [functionCohesion, cognitiveComplexity, classCohesion, fileCohesion, moduleSize],
  coupling: [exportConsumers, exportSpread, exportSurface, moduleDependencies, packageSpread],
};

export const builtinRules: readonly Rule[] = Object.values(ruleClasses).flat();

const on = (rules: readonly Rule[]): RulesetDefinition => ({
  rules: Object.fromEntries(rules.map((rule) => [rule.id, 'on' as const])),
});

const source = 'https://github.com/yearofthedan/warp/blob/main';

const documented = (rule: Rule): Rule => ({
  ...rule,
  docs: `${source}/src/builtins/${rule.id}/README.md`,
});

export const builtinRegistry = registry(builtinRules.map(documented));

export const warp: Plugin = {
  rules: [...builtinRegistry.values()],
  rulesets: {
    boundaries: on(ruleClasses.boundaries),
    cohesion: on(ruleClasses.cohesion),
    coupling: on(ruleClasses.coupling),
    toolkit: { rules: { 'export-consumers': 'off', 'export-surface': 'off', 'file-cohesion': 'off' } },
    wiring: { rules: { 'module-dependencies': 'off', 'export-spread': 'off' } },
    test: { rules: { 'function-cohesion': 'off', 'cognitive-complexity': 'off' } },
  },
};
