import { ConfigError } from '../errors/configError.ts';
import {
  type ArchetypeData,
  type ExposesData,
  isTestData,
  type RefData,
  type RuleSettingsData,
} from '../model/data.ts';
import type { Names } from './rulesets.ts';
import type { PendingRef } from './structure.ts';
import { type Fail, isRecord, list } from '../model/shared.ts';
import { exposesText, show } from '../model/text.ts';

export interface Check {
  fail: Fail;
  ruleIds?: ReadonlySet<string> | undefined;
  options: Readonly<Record<string, (raw: Record<string, unknown>, at: string) => unknown>>;
  moduleOptions?: Readonly<Record<string, readonly string[]>>;
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

export const toRules = (check: Check, value: unknown, where: string, names?: Names): RuleSettingsData | undefined => {
  if (value === undefined) return undefined;
  if (value === 'off') return { '*': false };
  if (!isRecord(value)) {
    check.fail(`${where}: expected off or rule settings by id`);
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([id, setting]) => {
      const parsed = toSetting(check, id, setting, where, names);
      return parsed === undefined ? [] : [[id, parsed]];
    }),
  ) as RuleSettingsData;
};

const toSetting = (check: Check, id: string, setting: unknown, where: string, names: Names | undefined) => {
  if (id !== '*' && check.ruleIds && !check.ruleIds.has(id)) check.fail(`${where}: no rule called ${id}`);
  else if (id === '*' && setting !== 'off' && setting !== false)
    check.fail(`${where}.*: expected off; turn rules on by name, or extend a ruleset such as warp:recommended`);
  else if (setting === 'on' || setting === 'off') return setting === 'on';
  else if (typeof setting === 'boolean') return setting;
  else if (isRecord(setting)) return checkOptions(check, id, setting, where, names);
  else check.fail(`${where}.${id}: expected on, off or options`);
  return undefined;
};

const checkOptions = (
  check: Check,
  id: string,
  options: Record<string, unknown>,
  where: string,
  names: Names | undefined,
) => {
  try {
    check.options[id]?.(options, `${where}.${id}`);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    check.fail(error.message);
    return { ...options };
  }
  const resolved = (check.moduleOptions?.[id] ?? [])
    .filter((key) => Array.isArray(options[key]))
    .map((key) => [key, modules(check, options[key] as string[], `${where}.${id}.${key}`, names)]);
  return { ...options, ...Object.fromEntries(resolved) };
};

const modules = (check: Check, entries: readonly string[], where: string, names: Names | undefined): RefData[] => {
  if (!names) {
    check.fail(`${where}: names modules, so it goes in a ruleset on the root, a module or an archetype`);
    return [];
  }
  return entries.flatMap((entry) => {
    const ref = names(entry, where);
    if (ref === undefined) return [];
    if (ref.kind === 'package' || ref.surface !== undefined) {
      check.fail(`${where}: '${entry}': name a module, not a package or a surface`);
      return [];
    }
    return [ref];
  });
};
