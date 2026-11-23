import { ConfigError } from '../configError.ts';
import { recordedAs } from './builder.ts';
import type {
  ArchetypeData,
  ExposesData,
  FilesModuleData,
  ModuleData,
  ModuleRefData,
  RefData,
  RuleSettingsData,
  TestLayerData,
} from './data.ts';
import type { Draft, DraftExposes, DraftTests } from './draft.ts';
import { type Fail, isName, isRecord, list } from './shared.ts';

export interface Check {
  fail: Fail;
  ruleIds?: ReadonlySet<string> | undefined;
  options: Readonly<Record<string, (raw: Record<string, unknown>, at: string) => unknown>>;
  exposesOf: (archetype: string) => DraftExposes | undefined;
}

type RefKind = RefData['kind'];

interface Scope {
  archetype: ArchetypeData;
  visible: number;
  kinds: readonly RefKind[];
  refused: string;
  module?: string;
  whole?: boolean;
}

export const show = (ref: RefData): string =>
  ref.kind === 'package'
    ? `pkg('${ref.pattern}')`
    : `${ref.kind === 'required' ? `required.${ref.name}` : ref.module}${ref.surface === undefined ? '' : `.${ref.surface}`}`;

export const resolveDraft = (check: Check, { data: archetype, modules, exposes, provides, tests }: Draft) => {
  for (const [index, module] of modules.entries()) {
    const scope: Scope = {
      archetype,
      visible: index,
      kinds: ['module', 'required', 'package'],
      refused: '',
      module: module.data.name,
    };
    const where = `${archetype.name}.${module.data.name}`;
    module.data.using.push(...module.using.map((value) => toRef(check, value, `${where} uses`, scope)));
    if (module.tests && module.data.kind === 'files')
      module.data.tests = testLayer(check, `${where}.tests`, archetype, module.tests, scope);
  }
  const own: Scope = {
    archetype,
    visible: archetype.modules.length,
    kinds: ['module'],
    refused: 'exposes and provides name the archetype’s own modules',
  };
  if (exposes) archetype.exposes = exposesData(check, archetype.name, exposes, own);
  for (const [name, value] of Object.entries(provides)) {
    const scope = { ...own, whole: true };
    archetype.provides[name] = toRef(check, value, `${archetype.name} provides ${name} as`, scope) as ModuleRefData;
  }
  if (tests)
    archetype.tests = testLayer(check, `${archetype.name}.tests`, archetype, tests, {
      ...own,
      kinds: ['module', 'required', 'package'],
      refused: '',
      module: 'tests',
    });
};

const testLayer = (
  check: Check,
  where: string,
  holder: ArchetypeData,
  tests: DraftTests,
  scope: Scope,
): TestLayerData => {
  const modules = tests.modules.map((module) => module.data as FilesModuleData);
  const layer: ArchetypeData = { ...holder, name: where, modules, provides: {} };
  const own: Scope = {
    archetype: layer,
    visible: modules.length,
    kinds: ['module'],
    refused: 'exposes names the layer’s own test modules',
  };
  return {
    ...(tests.locator ? { locator: tests.locator } : {}),
    modules,
    using: tests.using.map((value) => toRef(check, value, `${where} uses`, scope)),
    ...(tests.exposes ? { exposes: exposesData(check, where, tests.exposes, own) } : {}),
  };
};

const exposesData = (check: Check, name: string, exposes: DraftExposes, scope: Scope): ExposesData =>
  exposes.kind !== 'surfaces'
    ? exposes
    : {
        kind: 'surfaces',
        surfaces: Object.fromEntries(
          Object.entries(exposes.surfaces).map(([surface, refs]) => [
            surface,
            refs.map((value) => toRef(check, value, `${name} exposes ${surface} as`, scope)),
          ]),
        ),
      };

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
  if (ref.kind === 'required') return requiredProblem(check, ref.name, ref.surface, scope.archetype);
  return moduleProblem(check, ref.module, ref.surface, scope);
};

const requiredProblem = (check: Check, name: string, surface: string | undefined, archetype: ArchetypeData) => {
  const requirement = archetype.requires[name];
  if (!requirement) return `${archetype.name} requires ${list(Object.keys(archetype.requires), 'nothing')}`;
  if (requirement.kind !== 'archetype')
    return surface === undefined ? undefined : `required.${name} is ${requirement.kind}(), which has no surfaces`;
  return exposedProblem(`required.${name}`, requirement.archetype, check.exposesOf(requirement.archetype), surface);
};

const moduleProblem = (check: Check, name: string, surface: string | undefined, scope: Scope) => {
  const index = scope.archetype.modules.findIndex((module) => module.name === name);
  if (index < 0 || index >= scope.visible) return visibilityProblem(name, index, scope);
  if (surface !== undefined && scope.whole) return 'name the whole module, without a surface';
  const module = scope.archetype.modules[index]!;
  if (module.kind === 'files') return exposedProblem(name, undefined, module.exposes, surface);
  return exposedProblem(name, archetypeText(scope.archetype, module), check.exposesOf(module.archetype), surface);
};

const archetypeText = (holder: ArchetypeData, module: ModuleData & { kind: 'dir' }): string | undefined =>
  module.archetype === holder.name || module.archetype.startsWith(`${holder.name}.`) ? undefined : module.archetype;

const exposedProblem = (
  name: string,
  archetype: string | undefined,
  exposes: DraftExposes | undefined,
  surface: string | undefined,
): string | undefined => {
  const subject = archetype === undefined ? name : `${name} (${archetype})`;
  if (exposes === undefined)
    return `${subject} exposes nothing: give ${archetype ?? name} exposes, or drop the reference`;
  if (surface === undefined) return undefined;
  if (exposes.kind !== 'surfaces') return `${subject} exposes ${exposesText(exposes)}, not named surfaces`;
  const surfaces = Object.keys(exposes.surfaces);
  return surfaces.includes(surface) ? undefined : `${subject} exposes ${list(surfaces, 'nothing')}`;
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
