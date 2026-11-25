import {
  inlineName,
  moduleRefs,
  requiredRefs,
  type RecordedDefinition,
  type RecordedModule,
  recordedAs,
  self,
} from './builder.ts';
import type { ArchetypeData, ExposesData, IdentifyData, LocatorData, ModuleData, RequirementData } from './data.ts';
import { type Fail, isName, isRecord } from './shared.ts';

export interface DraftModule {
  data: ModuleData;
  using: unknown[];
}

type FilesExposes = Exclude<ExposesData, { kind: 'surfaces' }>;

export type DraftExposes =
  | { kind: 'all' }
  | { kind: 'files'; patterns: string[]; entry?: true }
  | { kind: 'surfaces'; surfaces: Record<string, unknown[]> };

export interface Draft {
  data: ArchetypeData;
  modules: DraftModule[];
  exposes?: DraftExposes;
  testExposes?: Record<string, unknown[]>;
  provides: Record<string, unknown>;
  testUsing: unknown[];
}

export interface Collected extends RecordedDefinition {
  inline?: true;
  using?: unknown;
}

export const collect = (root: RecordedDefinition, fail: Fail): Map<string, Collected> => {
  const byName = new Map<string, Collected>();
  const pending: Collected[] = [root];
  for (let definition = pending.shift(); definition; definition = pending.shift()) {
    const known = byName.get(definition.name as string);
    if (!isName(definition.name)) fail(`archetype(${JSON.stringify(definition.name)}): a name is a non-empty string`);
    else if (known && known !== definition) fail(`two archetypes are named ${definition.name}: give each its own name`);
    else if (!known) {
      byName.set(definition.name, definition);
      pending.push(...reached(definition));
    }
  }
  return byName;
};

const named = (value: unknown): RecordedDefinition[] => {
  const definition = recordedAs(value, 'archetype')?.definition;
  return definition && definition.name !== undefined ? [definition] : [];
};

const reached = (definition: Collected): Collected[] => [
  ...entriesOf(definition.modules).flatMap((entry) => (entry.test ? [] : named(entry.archetype))),
  ...Object.values(isRecord(definition.requires) ? definition.requires : {}).flatMap(named),
  ...inlineArchetypes(definition),
];

const anonymousOf = (entry: RecordedModule): RecordedDefinition | undefined => {
  const definition = recordedAs(entry.archetype, 'archetype')?.definition;
  return definition?.name === undefined ? definition : undefined;
};

const inlineArchetypes = (holder: Collected): Collected[] =>
  isName(holder.name)
    ? entriesOf(holder.modules).flatMap((entry) =>
        isInline(entry) && isName(entry.name)
          ? [
              {
                ...anonymousOf(entry),
                name: inlineName(holder.name as string, entry.name),
                inline: true,
                requires: holder.requires,
                modules: anonymousOf(entry)?.modules ?? [],
                description: undefined,
              },
            ]
          : [],
      )
    : [];

const isInline = (entry: RecordedModule): boolean =>
  !entry.test &&
  (entry.archetype === undefined || anonymousOf(entry) !== undefined) &&
  recordedAs(entry.selector, 'selector')?.kind === 'dir';

const entriesOf = (modules: unknown): readonly RecordedModule[] => (Array.isArray(modules) ? modules : []);

const callback = (value: unknown): unknown => (typeof value === 'function' ? value(moduleRefs()) : undefined);

export const draft = (name: string, state: Collected, fail: Fail): Draft => {
  checkFields(name, state, fail);
  const identify = identifyData(name, state.identify, fail);
  const requires = requirements(name, state.requires, fail);
  const modules = draftModules(name, state.modules, fail);
  const exposes = surfaceOf(name, state, fail);
  const testExposes = testSurfaceOf(name, state.testExposes, fail);
  const provides = state.provides === undefined ? {} : callback(state.provides);
  if (!isRecord(provides))
    fail(`${name}.provides: expected a callback returning modules by name, (m) => ({ strings: m.strings })`);
  const testUsing = usingOf(`${name}.testUsing`, state.testUsing, fail);
  return {
    data: {
      name,
      ...(state.inline ? { inline: true as const } : {}),
      description: state.description as string | undefined,
      identify,
      requires,
      modules: modules.map((module) => module.data),
      provides: {},
    },
    modules,
    ...(exposes ? { exposes } : {}),
    ...(testExposes ? { testExposes } : {}),
    provides: isRecord(provides) ? provides : {},
    testUsing,
  };
};

const surfaceOf = (name: string, state: Collected, fail: Fail): DraftExposes | undefined => {
  if (state.entry === undefined) return exposesOf(`${name}.exposes`, state.exposes, true, fail);
  if (state.exposes !== undefined)
    fail(`${name}: an entry is the module's whole surface; give it .entry(...) or .exposes(...)`);
  const selector = recordedAs(state.entry, 'selector');
  if (selector?.kind === 'files' && selector.patterns.every(isName))
    return { kind: 'files', patterns: selector.patterns as string[], entry: true };
  fail(`${name}.entry: expected the module's entry files, files('index.ts')`);
  return undefined;
};

const testSurfaceOf = (name: string, value: unknown, fail: Fail): Record<string, unknown[]> | undefined => {
  if (value === undefined) return undefined;
  const returned = callback(value);
  if (isRecord(returned))
    return Object.fromEntries(Object.entries(returned).map(([surface, refs]) => [surface, [refs].flat()]));
  fail(`${name}.testExposes: expected a callback returning test surfaces by name, (m) => ({ dsl: m.dsl })`);
  return undefined;
};

const exposesOf = (where: string, value: unknown, surfaces: boolean, fail: Fail): DraftExposes | undefined => {
  if (value === undefined) return undefined;
  if (recordedAs(value, 'all')) return { kind: 'all' };
  const selector = recordedAs(value, 'selector');
  if (selector?.kind === 'files' && selector.patterns.every(isName))
    return { kind: 'files', patterns: selector.patterns as string[] };
  const returned = surfaces ? callback(value) : undefined;
  if (isRecord(returned))
    return {
      kind: 'surfaces',
      surfaces: Object.fromEntries(Object.entries(returned).map(([surface, refs]) => [surface, [refs].flat()])),
    };
  const shapes = surfaces ? `all(), files('a.ts', ...) or (m) => ({ render: m.dom })` : `all() or files('a.ts', ...)`;
  fail(`${where}: expected ${shapes}`);
  return undefined;
};

const checkFields = (name: string, state: Collected, fail: Fail) => {
  if (state.description !== undefined && typeof state.description !== 'string')
    fail(`${name}.description: expected a string`);
  if (!Array.isArray(state.modules)) fail(`${name}.contains: expected the modules chain, (m) => m.module(...)`);
};

const draftModules = (archetype: string, recorded: unknown, fail: Fail): DraftModule[] => {
  const modules: DraftModule[] = [];
  for (const entry of entriesOf(recorded)) {
    const module = draftModule(archetype, entry, fail);
    if (modules.some((other) => other.data.name === module.data.name))
      fail(`${archetype}: module '${module.data.name}' is already declared`);
    else modules.push(module);
  }
  return modules;
};

const draftModule = (archetype: string, entry: RecordedModule, fail: Fail): DraftModule => {
  const { name } = entry;
  if (!isName(name) || name.includes('.'))
    fail(`${archetype}: a module's name is a non-empty string without dots, not ${JSON.stringify(name)}`);
  const where = `${archetype}.${String(name)}`;
  if (entry.test) return draftTestModule(archetype, entry, where, fail);
  const { kind, patterns } = selectorOf(where, entry.selector, fail);
  if (entry.extra.length > 0) fail(`${where}: .module() takes a name, a selector and an archetype`);
  const { named, anonymous, using } = archetypeOf(where, archetype, entry.archetype, fail);
  const description = anonymous?.description as string | undefined;
  const common = { name: name as string, using: [], ...(description === undefined ? {} : { description }) };
  if (anonymous) checkAnonymous(where, kind, anonymous, fail);
  if (kind === 'dir')
    return {
      data: { kind, ...common, paths: patterns, archetype: named ?? inlineName(archetype, name as string) },
      using,
    };
  if (named !== undefined) fail(`${where}: an archetype makes a folder module; use dir(...), not files(...)`);
  const exposes = exposesOf(`${where}.exposes`, anonymous?.exposes, false, fail) as FilesExposes | undefined;
  return { data: { kind, ...common, patterns, ...(exposes ? { exposes } : {}) }, using };
};

const draftTestModule = (holder: string, entry: RecordedModule, where: string, fail: Fail): DraftModule => {
  const locator = locatorOf(where, entry.selector, fail);
  if (entry.extra.length > 0) fail(`${where}: .testModule() takes a name, a selector and an archetype`);
  const { named, anonymous, using } = archetypeOf(where, holder, entry.archetype, fail);
  if (named !== undefined)
    fail(`${where}: a test module's archetype is its own: using(...), exposes(...) or description(...)`);
  if (anonymous) checkAnonymous(where, 'test', anonymous, fail);
  const exposes = exposesOf(`${where}.exposes`, anonymous?.exposes, false, fail) as FilesExposes | undefined;
  const description = anonymous?.description as string | undefined;
  return {
    data: {
      kind: 'test',
      name: entry.name as string,
      locator,
      using: [],
      ...(exposes ? { exposes } : {}),
      ...(description === undefined ? {} : { description }),
    },
    using,
  };
};

const locatorOf = (where: string, value: unknown, fail: Fail): LocatorData => {
  const selector = recordedAs(value, 'selector');
  if (selector?.kind !== 'mirror') return selectorOf(where, value, fail, 'test');
  const [from, to] = selector.patterns;
  if (!isMirrorPath(from) || !isMirrorPath(to))
    fail(`${where}: mirror() takes two folder paths without placeholders, mirror('src', 'test')`);
  return { kind: 'mirror', from: String(from), to: String(to) };
};

const isMirrorPath = (path: unknown): boolean => isName(path) && !path.includes('{') && isDirPath(path);

const archetypeOf = (where: string, holder: string, value: unknown, fail: Fail) => {
  if (value === undefined) return { using: [] };
  if (value === self) return { named: holder, using: [] };
  const recorded = recordedAs(value, 'archetype');
  if (!recorded) {
    fail(`${where}: expected an archetype, such as component, using(...) or exposes(all())`);
    return { using: [] };
  }
  const using = usingOf(`${where}.using`, recorded.using, fail);
  const { definition } = recorded;
  return definition.name === undefined ? { anonymous: definition, using } : { named: definition.name as string, using };
};

const checkAnonymous = (where: string, kind: 'dir' | 'files' | 'test', definition: RecordedDefinition, fail: Fail) => {
  if (definition.description !== undefined && typeof definition.description !== 'string')
    fail(`${where}.description: expected a string`);
  if (isRecord(definition.requires) && Object.keys(definition.requires).length > 0)
    fail(
      `${where}.requires: a module's own archetype sees what its holder requires; name the archetype to require more`,
    );
  if (kind === 'dir') return;
  const hasModules = Array.isArray(definition.modules) && definition.modules.length > 0;
  const folderOnly = [
    ...(hasModules ? ['contains'] : []),
    ...(['identify', 'provides', 'entry', 'testExposes', 'testUsing'] as const).filter(
      (field) => definition[field] !== undefined,
    ),
  ];
  for (const field of folderOnly)
    fail(
      kind === 'test'
        ? `${where}.${field}: a test module holds test code; its archetype takes using(...), exposes(...) and description(...)`
        : `${where}.${field}: a files module has no modules; use dir(...) for ${field}`,
    );
};

const selectorOf = (
  where: string,
  value: unknown,
  fail: Fail,
  of: 'module' | 'test' = 'module',
): { kind: 'dir' | 'files'; patterns: string[] } => {
  const selector = recordedAs(value, 'selector');
  if (!selector || selector.kind === 'mirror') {
    const shapes =
      of === 'test' ? "files('*.test.ts'), dir('e2e') or mirror('src', 'test')" : "files('*.ts') or dir('src/ui')";
    fail(`${where}: expected a selector, ${shapes}`);
    return { kind: 'files', patterns: [] };
  }
  const patterns = selector.patterns as string[];
  if (!patterns.every(isName)) fail(`${where}: ${selector.kind}() takes non-empty strings`);
  if (selector.kind === 'dir') checkDirPaths(where, patterns, fail);
  return { kind: selector.kind, patterns };
};

const usingOf = (where: string, value: unknown, fail: Fail): unknown[] => {
  const using = typeof value === 'function' ? value(moduleRefs(), { required: requiredRefs() }) : (value ?? []);
  if (Array.isArray(using)) return using;
  fail(`${where}: expected a list of references, or a callback returning one`);
  return [];
};

const checkDirPaths = (where: string, paths: readonly unknown[], fail: Fail) => {
  for (const path of paths.filter((path) => isName(path) && !isDirPath(path)))
    fail(`${where}: a dir path is folder names and {placeholders}, a whole segment each, not '${String(path)}'`);
};

const isDirPath = (path: string): boolean =>
  path.split('/').every((segment) => segment !== '.' && segment !== '..' && /^(\{\w+\}|[^{}*]+)$/.test(segment));

const requirements = (archetype: string, value: unknown, fail: Fail): Record<string, RequirementData> => {
  if (!isRecord(value)) {
    fail(`${archetype}.requires: expected requirements by name, { testRunner, strings: dir() }`);
    return {};
  }
  const result: Record<string, RequirementData> = {};
  for (const [name, requirement] of Object.entries(value)) {
    const shape = recordedAs(requirement, 'shape');
    const required = recordedAs(requirement, 'archetype')?.definition.name;
    if (shape) result[name] = { kind: shape };
    else if (isName(required)) result[name] = { kind: 'archetype', archetype: required };
    else fail(`${archetype}.requires.${name}: expected an archetype, dir() or files()`);
  }
  return result;
};

const identifyData = (archetype: string, value: unknown, fail: Fail): IdentifyData | undefined => {
  const keys = isRecord(value) ? Object.keys(value) : [];
  if (value === undefined || (keys.length === 1 && isName((value as { marker?: unknown }).marker)))
    return value as IdentifyData | undefined;
  if (keys.length === 1 && typeof (value as { match?: unknown }).match === 'function') return value as IdentifyData;
  fail(`${archetype}.identify: expected { marker: '{name}.dom.ts' } or { match: (dir, chain) => ... }`);
  return undefined;
};
