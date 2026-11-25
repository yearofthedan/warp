import { ConfigError } from '../configError.ts';
import { recordedAs } from './builder.ts';
import type { ArchetypeData, ExposesData, ModuleData, ModuleRefData, RefData, RuleSettingsData } from './data.ts';
import type { Draft, DraftExposes } from './draft.ts';
import { type Fail, isName, isRecord, list } from './shared.ts';

export interface Check {
  fail: Fail;
  ruleIds?: ReadonlySet<string> | undefined;
  options: Readonly<Record<string, (raw: Record<string, unknown>, at: string) => unknown>>;
  exposesOf: (archetype: string) => DraftExposes | undefined;
  testExposesOf: (archetype: string) => Record<string, unknown[]> | undefined;
}

type RefKind = RefData['kind'];

interface Scope {
  archetype: ArchetypeData;
  visible: number;
  kinds: readonly RefKind[];
  refused: string;
  tests: boolean;
  module?: string;
  whole?: boolean;
  surface?: true;
}

export const show = (ref: RefData): string =>
  ref.kind === 'package'
    ? `pkg('${ref.pattern}')`
    : `${ref.kind === 'required' ? `required.${ref.name}` : ref.module}${ref.surface === undefined ? '' : `.${ref.surface}`}`;

export const resolveDraft = (
  check: Check,
  { data: archetype, modules, exposes, testExposes, provides, testUsing }: Draft,
) => {
  const every: readonly RefKind[] = ['module', 'required', 'package'];
  for (const [index, module] of modules.entries()) {
    const scope: Scope = {
      archetype,
      visible: index,
      kinds: every,
      refused: '',
      tests: module.data.kind === 'test',
      module: module.data.name,
    };
    const where = `${archetype.name}.${module.data.name}`;
    module.data.using.push(...module.using.map((value) => toRef(check, value, `${where} uses`, scope)));
  }
  const own: Scope = {
    archetype,
    visible: archetype.modules.length,
    kinds: ['module'],
    refused: 'exposes and provides name the archetype’s own modules',
    tests: false,
  };
  if (exposes) archetype.exposes = exposesData(check, archetype.name, exposes, { ...own, surface: true });
  if (testExposes)
    archetype.testExposes = surfacesData(check, `${archetype.name} testExposes`, testExposes, {
      ...own,
      refused: 'testExposes names the archetype’s own modules',
      tests: true,
    });
  for (const [name, value] of Object.entries(provides)) {
    const scope = { ...own, whole: true };
    archetype.provides[name] = toRef(check, value, `${archetype.name} provides ${name} as`, scope) as ModuleRefData;
  }
  const kit: Scope = { ...own, kinds: every, refused: '', tests: true };
  if (testUsing.length > 0)
    archetype.testUsing = testUsing.map((value) => toRef(check, value, `${archetype.name} testUsing`, kit));
};

const exposesData = (check: Check, name: string, exposes: DraftExposes, scope: Scope): ExposesData =>
  exposes.kind !== 'surfaces'
    ? exposes
    : { kind: 'surfaces', surfaces: surfacesData(check, `${name} exposes`, exposes.surfaces, scope) };

const surfacesData = (
  check: Check,
  where: string,
  surfaces: Record<string, unknown[]>,
  scope: Scope,
): Record<string, RefData[]> =>
  Object.fromEntries(
    Object.entries(surfaces).map(([surface, refs]) => [
      surface,
      refs.map((value) => toRef(check, value, `${where} ${surface} as`, scope)),
    ]),
  );

const toRef = (check: Check, value: unknown, where: string, scope: Scope): RefData => {
  const ref = recordedAs(value, 'ref');
  if (!ref) check.fail(`${where} something other than a reference: use s.module, required.name or pkg('name')`);
  else {
    const problem = refProblem(check, ref, scope);
    if (problem) check.fail(`${where} ${show(ref)}; ${problem}`);
  }
  return { ...ref } as RefData;
};

export const toRules = (check: Check, value: unknown, where: string): RuleSettingsData | undefined => {
  if (value === undefined || value === 'off') return value;
  if (!isRecord(value)) {
    check.fail(`${where}: expected 'off' or rule settings by id`);
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value).map(([id, setting]) => [id, toSetting(check, id, setting, where)]),
  ) as RuleSettingsData;
};

const toSetting = (check: Check, id: string, setting: unknown, where: string) => {
  if (id !== '*' && check.ruleIds && !check.ruleIds.has(id)) check.fail(`${where}: no rule called ${id}`);
  else if (typeof setting === 'boolean') return setting;
  else if (id !== '*' && isRecord(setting) && !recordedAs(setting, 'ref'))
    return checkOptions(check, id, setting, where);
  else check.fail(`${where}.${id}: expected true, false${id === '*' ? '' : ' or options'}`);
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

const refProblem = (check: Check, ref: RefData, scope: Scope): string | undefined => {
  if (!scope.kinds.includes(ref.kind)) return scope.refused;
  if (ref.kind === 'package') return isName(ref.pattern) ? undefined : 'a package pattern is a non-empty string';
  if (ref.kind === 'required') return requiredProblem(check, ref.name, ref.surface, scope);
  return moduleProblem(check, ref.module, ref.surface, scope);
};

const requiredProblem = (check: Check, name: string, surface: string | undefined, { archetype, tests }: Scope) => {
  const requirement = archetype.requires[name];
  if (!requirement) return `${archetype.name} requires ${list(Object.keys(archetype.requires), 'nothing')}`;
  if (requirement.kind !== 'archetype')
    return surface === undefined ? undefined : `required.${name} is ${requirement.kind}(), which has no surfaces`;
  return exposedProblem(
    `required.${name}`,
    requirement.archetype,
    surfacesOf(check, requirement.archetype),
    surface,
    tests,
  );
};

const surfacesOf = (check: Check, archetype: string): Surfaces => ({
  exposes: check.exposesOf(archetype),
  testExposes: Object.keys(check.testExposesOf(archetype) ?? {}),
});

const moduleProblem = (check: Check, name: string, surface: string | undefined, scope: Scope) => {
  const index = scope.archetype.modules.findIndex((module) => module.name === name);
  if (index < 0 || index >= scope.visible) return visibilityProblem(name, index, scope);
  if (surface !== undefined && scope.whole) return 'name the whole module, without a surface';
  const module = scope.archetype.modules[index]!;
  if (module.kind === 'test')
    return scope.tests
      ? exposedProblem(name, undefined, { exposes: module.exposes ?? { kind: 'all' }, testExposes: [] }, surface, true)
      : testModuleProblem(name, scope);
  if (module.kind === 'files')
    return exposedProblem(name, undefined, { exposes: module.exposes, testExposes: [] }, surface, scope.tests);
  const archetype = archetypeText(scope.archetype, module);
  return exposedProblem(name, archetype, surfacesOf(check, module.archetype), surface, scope.tests);
};

const testModuleProblem = (name: string, { surface }: Scope): string =>
  surface
    ? `${name} is a test module, and exposes is production code: name it in testExposes`
    : `${name} is a test module, which only test modules and testUsing may name`;

const archetypeText = (holder: ArchetypeData, module: ModuleData & { kind: 'dir' }): string | undefined =>
  module.archetype === holder.name || module.archetype.startsWith(`${holder.name}.`) ? undefined : module.archetype;

interface Surfaces {
  exposes: DraftExposes | undefined;
  testExposes: readonly string[];
}

const exposedProblem = (
  name: string,
  archetype: string | undefined,
  { exposes, testExposes }: Surfaces,
  surface: string | undefined,
  tests: boolean,
): string | undefined => {
  const subject = archetype === undefined ? name : `${name} (${archetype})`;
  if (surface !== undefined && testExposes.includes(surface))
    return tests
      ? undefined
      : `${surface} is a test surface of ${subject}, which only test modules and testUsing may name`;
  if (exposes === undefined && (!tests || testExposes.length === 0))
    return `${subject} exposes nothing: give ${archetype ?? name} exposes, or drop the reference`;
  if (surface === undefined) return undefined;
  const surfaces = exposes?.kind === 'surfaces' ? Object.keys(exposes.surfaces) : [];
  if (surfaces.includes(surface)) return undefined;
  const named = [...surfaces, ...(tests ? testExposes : [])];
  if (exposes?.kind === 'surfaces' || named.length > 0) return `${subject} exposes ${list(named, 'nothing')}`;
  return `${subject} exposes ${exposesText(exposes)}, not named surfaces`;
};

export const exposesText = (exposes: DraftExposes | ExposesData | undefined): string => {
  if (exposes === undefined) return 'nothing';
  if (exposes.kind === 'all') return 'all its files';
  if (exposes.kind === 'files') return `files(${exposes.patterns.map((pattern) => `'${pattern}'`).join(', ')})`;
  return list(Object.keys(exposes.surfaces), 'nothing');
};

const visibilityProblem = (name: string, index: number, { archetype, visible, module }: Scope): string => {
  const above = list(
    archetype.modules.slice(0, visible).map((candidate) => candidate.name),
    'no modules',
  );
  if (module === undefined) return `${archetype.name} has modules ${above}`;
  if (index < 0) return `${module} sees ${above}`;
  if (index === visible) return `a module reaches its own files already; ${module} sees ${above}`;
  return `${name} is declared below ${module}, which sees ${above}`;
};
