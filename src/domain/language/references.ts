import { ConfigError } from '../model/configError.ts';
import { type ArchetypeData, type ExposesData, isTestData, type RuleSettingsData } from '../model/data.ts';
import type { PendingRef } from './structure.ts';
import { type Fail, isRecord, list } from '../model/shared.ts';
import { exposesText, show } from '../model/text.ts';

export interface Check {
  fail: Fail;
  ruleIds?: ReadonlySet<string> | undefined;
  options: Readonly<Record<string, (raw: Record<string, unknown>, at: string) => unknown>>;
}

export const checkReferences = (
  archetypes: Record<string, ArchetypeData>,
  pending: readonly PendingRef[],
  fail: Fail,
) => {
  for (const entry of pending) {
    const problem = refProblem(archetypes, entry);
    if (problem) fail(`${entry.where}: '${show(entry.ref)}': ${problem}`);
  }
};

const refProblem = (archetypes: Record<string, ArchetypeData>, { ref, archetype, tests, surface }: PendingRef) => {
  if (ref.kind !== 'module') return undefined;
  const module = archetypes[archetype]?.modules.find((candidate) => candidate.name === ref.module);
  if (!module) return undefined;
  if (isTestData(module) && !tests)
    return surface
      ? `${ref.module} is a test module, and exposes is production code: name it in test.exposes`
      : `${ref.module} is a test module, which only test code may name`;
  if (module.kind === 'test')
    return exposedProblem(
      ref.module,
      { exposes: module.exposes ?? { kind: 'all' }, testExposes: [] },
      ref.surface,
      true,
    );
  if (module.kind === 'files')
    return exposedProblem(ref.module, { exposes: module.exposes, testExposes: [] }, ref.surface, tests);
  const inside = archetypes[module.archetype];
  if (!inside) return undefined;
  const exposes = module.test && !inside.testExposes ? (inside.exposes ?? { kind: 'all' }) : inside.exposes;
  const subject = inside.inline ? ref.module : `${ref.module} (${module.archetype})`;
  return exposedProblem(subject, { exposes, testExposes: Object.keys(inside.testExposes ?? {}) }, ref.surface, tests);
};

interface Surfaces {
  exposes: ExposesData | undefined;
  testExposes: readonly string[];
}

export const exposedProblem = (
  subject: string,
  { exposes, testExposes }: Surfaces,
  surface: string | undefined,
  tests: boolean,
): string | undefined => {
  if (surface !== undefined && testExposes.includes(surface))
    return tests ? undefined : `${surface} is a test surface of ${subject}, which only test code may name`;
  if (exposes === undefined && (!tests || testExposes.length === 0))
    return `${subject} exposes nothing: give it exposes, or drop the reference`;
  if (surface === undefined) return undefined;
  const surfaces = exposes?.kind === 'surfaces' ? Object.keys(exposes.surfaces) : [];
  if (surfaces.includes(surface)) return undefined;
  const named = [...surfaces, ...(tests ? testExposes : [])];
  if (exposes?.kind === 'surfaces' || named.length > 0) return `${subject} exposes ${list(named, 'nothing')}`;
  return `${subject} exposes ${exposesText(exposes)}, not named surfaces`;
};

export const toRules = (check: Check, value: unknown, where: string): RuleSettingsData | undefined => {
  if (value === undefined || value === 'off') return value;
  if (!isRecord(value)) {
    check.fail(`${where}: expected off or rule settings by id`);
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value).map(([id, setting]) => [id, toSetting(check, id, setting, where)]),
  ) as RuleSettingsData;
};

const toSetting = (check: Check, id: string, setting: unknown, where: string) => {
  if (id !== '*' && check.ruleIds && !check.ruleIds.has(id)) check.fail(`${where}: no rule called ${id}`);
  else if (setting === 'on' || setting === 'off') return setting === 'on';
  else if (typeof setting === 'boolean') return setting;
  else if (id !== '*' && isRecord(setting)) return checkOptions(check, id, setting, where);
  else check.fail(`${where}.${id}: expected on, off${id === '*' ? '' : ' or options'}`);
  return undefined;
};

const checkOptions = (check: Check, id: string, options: Record<string, unknown>, where: string) => {
  try {
    check.options[id]?.(options, `${where}.${id}`);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    check.fail(error.message);
  }
  return { ...options };
};
