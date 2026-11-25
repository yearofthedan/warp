import type { RefData } from '../model/archetype/data.ts';
import type { Fix } from '../model/archetype/fixes.ts';
import type { Verdicts } from '../model/archetype/reach.ts';
import { show } from '../model/archetype/references.ts';
import type { Model } from '../model/archetype/resolve.ts';

export const refText = (ref: RefData): string => show(ref);

export const sentence = (parts: readonly string[]): string =>
  parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;

export const reachSize = (verdicts: Verdicts, file: string): number =>
  new Set((verdicts.reach(file) ?? []).flatMap((grant) => (grant.ref === undefined ? [] : [grant.ref]))).size;

const instances = (model: Model, archetype: string): string => {
  const count = model.modules.filter((module) => module.archetype === archetype).length;
  return count > 1 ? ` (all ${count} ${archetype} modules)` : '';
};

const step = (model: Model, fix: Fix, refs: readonly RefData[]): string => {
  switch (fix.kind) {
    case 'using':
      return `add ${refText(fix.ref)} to ${fix.site}`;
    case 'require':
      return `add ${fix.name} to ${fix.archetype}.requires, bound in the dependencies of ${sentence(fix.sites)}`;
    case 'expose':
      return `add ${sentence(refs.map(refText))} to ${fix.archetype}.exposes${instances(model, fix.archetype)}`;
    case 'test-expose':
      return `add ${sentence(refs.map(refText))} to ${fix.archetype}.test.exposes${instances(model, fix.archetype)}`;
    case 'expose-file':
      return `add '${fix.pattern}' to ${fix.archetype}.exposes files`;
  }
};

export const fixSteps = (model: Model, fixes: readonly Fix[]): string[] => {
  const steps: string[] = [];
  for (const [at, fix] of fixes.entries()) {
    if (fix.kind !== 'expose' && fix.kind !== 'test-expose') {
      steps.push(step(model, fix, []));
      continue;
    }
    const previous = fixes[at - 1];
    if (previous?.kind === fix.kind && previous.archetype === fix.archetype) continue;
    const refs: RefData[] = [];
    for (const next of fixes.slice(at)) {
      if (next.kind !== fix.kind || next.archetype !== fix.archetype) break;
      refs.push(next.ref);
    }
    steps.push(step(model, fix, refs));
  }
  return steps;
};
