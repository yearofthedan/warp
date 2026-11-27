import type {
  ArchetypeData,
  DirModuleData,
  ExposesData,
  FilesModuleData,
  ModuleData,
  PackageRefData,
  RefData,
  TestModuleData,
} from '../model/data.ts';
import { type Fail, isName, isRecord, list } from '../model/shared.ts';
import type { ParseRuleset } from './rulesets.ts';

export interface PendingRef {
  ref: RefData;
  where: string;
  archetype: string;
  tests: boolean;
  surface?: true;
}

export interface Structure {
  root: string;
  archetypes: Record<string, ArchetypeData>;
  pending: PendingRef[];
}

interface Scope {
  archetype: string;
  names: ReadonlySet<string>;
  parent?: Scope;
  inputs: ReadonlySet<string>;
  testInputs: ReadonlySet<string>;
  own?: string;
}

interface State {
  defs: Record<string, unknown>;
  archetypes: Record<string, ArchetypeData>;
  pending: PendingRef[];
  fail: Fail;
  ruleset: ParseRuleset;
}

export const rootName = 'root';

const moduleKeys = [
  'description',
  'dir',
  'files',
  'entry',
  'archetype',
  'dependencies',
  'exposes',
  'modules',
  'test',
  'ruleset',
];
const archetypeKeys = ['description', 'marker', 'requires', 'entry', 'exposes', 'modules', 'test', 'ruleset'];
const rootKeys = ['description', 'modules', 'test', 'ruleset'];
const testKeys = ['requires', 'dependencies', 'provides', 'exposes', 'modules', 'ruleset'];
const kindOf = new Map<readonly string[], string>([
  [archetypeKeys, 'an archetype'],
  [rootKeys, 'the root'],
  [testKeys, 'a test block'],
]);
const testModuleKeys = ['description', 'dir', 'files', 'archetype', 'dependencies', 'exposes', 'modules', 'ruleset'];

export const parseStructure = (root: unknown, archetypes: unknown, fail: Fail, ruleset: ParseRuleset): Structure => {
  const defs = archetypes === undefined ? {} : isRecord(archetypes) ? archetypes : {};
  if (archetypes !== undefined && !isRecord(archetypes)) fail('archetypes: expected archetypes by name');
  const state: State = { defs, archetypes: {}, pending: [], fail, ruleset };
  if (Object.hasOwn(defs, rootName))
    fail(`archetypes.${rootName}: root is the repository; name the archetype otherwise`);
  for (const [name, def] of Object.entries(defs)) {
    if (!isName(name) || name.includes('.')) fail(`archetypes: a name has no dots, not '${name}'`);
    archetype(state, name, record(state, `archetypes.${name}`, def), { keys: archetypeKeys });
  }
  if (!isRecord(root)) fail('root: expected the repository, root: { modules: ... }');
  else archetype(state, rootName, root, { keys: rootKeys });
  return { root: rootName, archetypes: state.archetypes, pending: state.pending };
};

const record = (state: State, where: string, value: unknown): Record<string, unknown> => {
  if (isRecord(value)) return value;
  state.fail(`${where}: expected a mapping`);
  return {};
};

const checkKeys = (state: State, where: string, def: Record<string, unknown>, keys: readonly string[]) => {
  for (const key of Object.keys(def).filter((key) => !keys.includes(key)))
    state.fail(`${where}: unknown key ${key}; ${kindOf.get(keys) ?? 'a module'} takes ${keys.join(', ')}`);
};

const strings = (state: State, where: string, value: unknown): string[] => {
  if (value === undefined) return [];
  const items = Array.isArray(value) ? value : [value];
  if (!items.every(isName)) state.fail(`${where}: expected a name or a list of names`);
  return items.filter(isName);
};

const description = (state: State, where: string, value: unknown): { description?: string } => {
  if (value === undefined) return {};
  if (typeof value !== 'string') state.fail(`${where}.description: expected a string`);
  return typeof value === 'string' ? { description: value } : {};
};

interface Options {
  keys: readonly string[];
  parent?: Scope;
  test?: boolean;
}

const archetype = (state: State, name: string, def: Record<string, unknown>, options: Options): ArchetypeData => {
  const where = options.parent ? `${options.parent.archetype}.${name.slice(name.lastIndexOf('.') + 1)}` : name;
  if (!options.parent) checkKeys(state, where, def, options.keys);
  const test = testBlock(state, where, def.test);
  const modules = def.modules === undefined ? {} : record(state, `${where}.modules`, def.modules);
  const testModules = test.modules === undefined ? {} : record(state, `${where}.test.modules`, test.modules);
  const data = options.parent ? inlineData(state, name, where, test) : namedData(state, name, def, test);
  if (options.test) data.test = true;
  Object.assign(data, rulesetsAt(state, where, def.ruleset, test.ruleset));
  const scope: Scope = {
    archetype: name,
    names: new Set([...Object.keys(modules), ...Object.keys(testModules), ...filesTestNames(modules)]),
    ...(options.parent ? { parent: options.parent } : {}),
    inputs: options.parent?.inputs ?? new Set(data.requires),
    testInputs: options.parent?.testInputs ?? new Set(data.testRequires),
  };
  state.archetypes[name] = data;
  const build = options.test ? testModule : productionModule;
  for (const [module, raw] of Object.entries(modules)) data.modules.push(...build(state, scope, module, raw));
  for (const [module, raw] of Object.entries(testModules)) data.modules.push(...testModule(state, scope, module, raw));
  const exposed = exposes(state, scope, `${where}.exposes`, def.exposes, def.entry, true, options.test === true);
  if (exposed) data.exposes = exposed;
  Object.assign(data, testSurfaces(state, scope, where, test, options.test === true));
  return data;
};

const namedData = (
  state: State,
  name: string,
  def: Record<string, unknown>,
  test: Record<string, unknown>,
): ArchetypeData => {
  const testRequires = strings(state, `${name}.test.requires`, test.requires);
  return {
    name,
    ...description(state, name, def.description),
    requires: strings(state, `${name}.requires`, def.requires),
    ...(testRequires.length > 0 ? { testRequires } : {}),
    ...marker(state, name, def.marker),
    modules: [],
  };
};

const inlineData = (state: State, name: string, where: string, test: Record<string, unknown>): ArchetypeData => {
  if (test.requires !== undefined)
    state.fail(`${where}.test.requires: only an archetype requires; its modules see what it requires`);
  return { name, inline: true, requires: [], modules: [] };
};

const rulesetsAt = (
  state: State,
  where: string,
  ruleset: unknown,
  testRuleset: unknown,
): Pick<ArchetypeData, 'ruleset' | 'testRuleset'> => {
  const own = state.ruleset(ruleset, `${where}.ruleset`);
  const tests = state.ruleset(testRuleset, `${where}.test.ruleset`);
  return { ...(own ? { ruleset: own } : {}), ...(tests ? { testRuleset: tests } : {}) };
};

const testBlock = (state: State, where: string, value: unknown): Record<string, unknown> => {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    state.fail(`${where}.test: expected a test block`);
    return {};
  }
  for (const key of Object.keys(value).filter((key) => !testKeys.includes(key)))
    state.fail(`${where}.test: unknown key ${key}; a test block takes ${testKeys.join(', ')}`);
  if (value.dependencies !== undefined)
    state.fail(`${where}.test.dependencies: fills an archetype's test.requires, where a module uses one`);
  return value;
};

const filesTestNames = (modules: Record<string, unknown>): string[] =>
  Object.entries(modules).flatMap(([module, raw]) =>
    isRecord(raw) && raw.files !== undefined && isRecord(raw.test) && isRecord(raw.test.modules)
      ? Object.keys(raw.test.modules).map((inner) => `${module}.${inner}`)
      : [],
  );

const marker = (state: State, where: string, value: unknown): Pick<ArchetypeData, 'identify'> => {
  if (value === undefined) return {};
  if (isName(value)) return { identify: { marker: value } };
  state.fail(`${where}.marker: expected a file pattern, such as '{name}.dom.ts'`);
  return {};
};

const testSurfaces = (
  state: State,
  scope: Scope,
  where: string,
  test: Record<string, unknown>,
  isTest: boolean,
): Pick<ArchetypeData, 'testExposes' | 'testUsing'> => {
  const data: Pick<ArchetypeData, 'testExposes' | 'testUsing'> = {};
  if (test.exposes !== undefined) {
    if (isTest) state.fail(`${where}.test.exposes: ${where} is test code; what it exposes is for tests already`);
    else data.testExposes = surfaces(state, scope, `${where}.test.exposes`, test.exposes, true);
  }
  if (test.provides !== undefined) {
    if (isTest) state.fail(`${where}.test.provides: ${where} is test code; give its modules dependencies`);
    else data.testUsing = references(state, scope, `${where}.test.provides`, test.provides, true);
  }
  return data;
};

const nameProblem = (name: string): boolean => !isName(name) || name.includes('.');

const productionModule = (state: State, scope: Scope, name: string, raw: unknown): ModuleData[] => {
  const where = `${scope.archetype}.${name}`;
  const def = record(state, where, raw);
  if (nameProblem(name)) state.fail(`${where}: a module's name has no dots, not '${name}'`);
  checkKeys(state, where, def, moduleKeys);
  const inner: Scope = { ...scope, own: name };
  if (def.archetype !== undefined) return [instance(state, inner, name, def, false)];
  if (def.dir !== undefined && def.files !== undefined) state.fail(`${where}: a module has dir or files, not both`);
  if (def.dir !== undefined) return [inlineDir(state, inner, name, def, false)];
  if (def.files === undefined) {
    state.fail(`${where}: expected dir, files or an archetype`);
    return [];
  }
  return filesModule(state, inner, name, def);
};

const testModule = (state: State, scope: Scope, name: string, raw: unknown): ModuleData[] => {
  const where = `${scope.archetype}.${name}`;
  const def = record(state, where, raw);
  if (nameProblem(name)) state.fail(`${where}: a module's name has no dots, not '${name}'`);
  checkKeys(state, where, def, testModuleKeys);
  const inner: Scope = { ...scope, own: name };
  if (def.archetype !== undefined) return [instance(state, inner, name, def, true)];
  if (def.dir !== undefined && def.files !== undefined) state.fail(`${where}: a module has dir or files, not both`);
  if (def.dir !== undefined) return [inlineDir(state, inner, name, def, true)];
  return [testFiles(state, inner, name, def)];
};

const testFiles = (
  state: State,
  scope: Scope,
  name: string,
  def: Record<string, unknown>,
  of?: string,
): TestModuleData => {
  const where = `${scope.archetype}.${name}`;
  if (def.modules !== undefined) state.fail(`${where}: a files module has no modules; use dir for a folder of them`);
  const exposed = exposes(state, scope, `${where}.exposes`, def.exposes, undefined, false, true);
  return {
    kind: 'test',
    name,
    patterns: patterns(state, `${where}.files`, def.files),
    ...(of === undefined ? {} : { of }),
    using: references(state, scope, `${where}.dependencies`, def.dependencies, true),
    ...(exposed && exposed.kind !== 'surfaces' ? { exposes: exposed } : {}),
    ...rulesetsAt(state, where, def.ruleset, undefined),
    ...description(state, where, def.description),
  };
};

const patterns = (state: State, where: string, value: unknown): string[] => {
  const found = strings(state, where, value);
  if (found.length === 0) state.fail(`${where}: expected a file pattern or a list of them`);
  return found;
};

const dirPaths = (state: State, where: string, value: unknown): string[] =>
  patterns(state, where, value).map((path) => {
    const segments = path.split('/');
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..' || segment === '**'))
      state.fail(`${where}: a dir is folder names or '*', a whole segment each, not '${path}'`);
    if (segments.filter((segment) => segment === '*').length > 1)
      state.fail(`${where}: one '*' per dir, which names each instance {name}; '${path}' has more`);
    return segments.map((segment) => (segment === '*' ? '{name}' : segment)).join('/');
  });

const instance = (
  state: State,
  scope: Scope,
  name: string,
  def: Record<string, unknown>,
  test: boolean,
): DirModuleData => {
  const where = `${scope.archetype}.${name}`;
  const named = String(def.archetype);
  if (!Object.hasOwn(state.defs, named)) state.fail(`${where}.archetype: no archetype called ${named}`);
  if (def.dir === undefined) state.fail(`${where}: an archetype makes a folder module; give it a dir`);
  for (const key of ['files', 'entry', 'exposes', 'modules'].filter((key) => def[key] !== undefined))
    state.fail(`${where}.${key}: ${named} defines what is inside; declare ${key} there`);
  const own = bindings(state, scope, `${where}.dependencies`, def.dependencies, test);
  const testBlock = isRecord(def.test) ? def.test : {};
  for (const key of Object.keys(testBlock).filter((key) => key !== 'dependencies' && key !== 'ruleset'))
    state.fail(`${where}.test.${key}: ${named} defines its test code; declare ${key} there`);
  const tests = bindings(state, scope, `${where}.test.dependencies`, testBlock.dependencies, true);
  return {
    kind: 'dir',
    name,
    paths: def.dir === undefined ? [] : dirPaths(state, `${where}.dir`, def.dir),
    archetype: named,
    ...(test ? { test: true as const } : {}),
    using: Object.values(own),
    ...(Object.keys(own).length > 0 ? { inputs: own } : {}),
    ...(Object.keys(tests).length > 0 ? { testInputs: tests } : {}),
    ...rulesetsAt(state, where, def.ruleset, testBlock.ruleset),
    ...description(state, where, def.description),
  };
};

const inlineDir = (
  state: State,
  scope: Scope,
  name: string,
  def: Record<string, unknown>,
  test: boolean,
): DirModuleData => {
  const where = `${scope.archetype}.${name}`;
  const inner = `${scope.archetype}.${name}`;
  if (isRecord(def.test) && def.test.dependencies !== undefined)
    state.fail(`${where}.test.dependencies: fills an archetype's test.requires; ${name} has no archetype`);
  archetype(state, inner, def, { keys: moduleKeys, parent: scope, test });
  return {
    kind: 'dir',
    name,
    paths: dirPaths(state, `${where}.dir`, def.dir),
    archetype: inner,
    ...(test ? { test: true as const } : {}),
    using: references(state, scope, `${where}.dependencies`, def.dependencies, test),
    ...description(state, where, def.description),
  };
};

const filesModule = (state: State, scope: Scope, name: string, def: Record<string, unknown>): ModuleData[] => {
  const where = `${scope.archetype}.${name}`;
  for (const key of ['modules', 'entry'].filter((key) => def[key] !== undefined))
    state.fail(`${where}.${key}: a files module has no modules; use dir for a folder of them`);
  const exposed = exposes(state, scope, `${where}.exposes`, def.exposes, undefined, false, false);
  const test = isRecord(def.test) ? def.test : {};
  const module: FilesModuleData = {
    kind: 'files',
    name,
    patterns: patterns(state, `${where}.files`, def.files),
    using: references(state, scope, `${where}.dependencies`, def.dependencies, false),
    ...(exposed && exposed.kind !== 'surfaces' ? { exposes: exposed } : {}),
    ...rulesetsAt(state, where, def.ruleset, test.ruleset),
    ...description(state, where, def.description),
  };
  for (const key of Object.keys(test).filter((key) => key !== 'modules' && key !== 'ruleset'))
    state.fail(`${where}.test.${key}: a files module's test block holds its test modules and ruleset only`);
  const tests = test.modules === undefined ? {} : record(state, `${where}.test.modules`, test.modules);
  const lifted = Object.entries(tests).map(([inner, raw]) => {
    const testDef = record(state, `${where}.test.modules.${inner}`, raw);
    checkKeys(state, `${where}.test.modules.${inner}`, testDef, testModuleKeys);
    if (testDef.dir !== undefined || testDef.archetype !== undefined)
      state.fail(`${where}.test.modules.${inner}: a files module's tests are files; use files`);
    return testFiles(state, { ...scope, own: `${name}.${inner}` }, `${name}.${inner}`, testDef, name);
  });
  return [module, ...lifted];
};

const entries = (state: State, where: string, value: unknown): [string, string][] => {
  if (value === undefined) return [];
  if (Array.isArray(value)) {
    if (!value.every(isName)) state.fail(`${where}: expected names, such as [domain, ports.projectStore, npm:x]`);
    return value.filter(isName).map((entry) => [keyOf(entry), entry]);
  }
  if (isRecord(value)) {
    const found = Object.entries(value).filter((entry): entry is [string, string] => isName(entry[1]));
    if (found.length !== Object.keys(value).length) state.fail(`${where}: expected a name for each key`);
    return found;
  }
  state.fail(`${where}: expected a list of names, or a map from name to name`);
  return [];
};

const keyOf = (entry: string): string => {
  const prefix = /^(npm|node|virtual):/.exec(entry);
  return prefix ? entry : entry.slice(entry.lastIndexOf('.') + 1);
};

const references = (state: State, scope: Scope, where: string, value: unknown, tests: boolean): RefData[] =>
  entries(state, where, value).flatMap(([, entry]) => {
    const ref = resolveName(state, scope, entry, tests, where);
    return ref ? [ref] : [];
  });

const bindings = (
  state: State,
  scope: Scope,
  where: string,
  value: unknown,
  tests: boolean,
): Record<string, RefData> => {
  const bound: Record<string, RefData> = {};
  for (const [key, entry] of entries(state, where, value)) {
    if (Object.hasOwn(bound, key)) state.fail(`${where}: two entries are named ${key}; rename one with a map`);
    const ref = resolveName(state, scope, entry, tests, where);
    if (ref) bound[key] = ref;
  }
  return bound;
};

const packageOf = (entry: string): PackageRefData | undefined => {
  if (entry.startsWith('npm:')) return { kind: 'package', pattern: entry.slice(4) };
  if (entry.startsWith('node:') || entry.startsWith('virtual:')) return { kind: 'package', pattern: entry };
  return undefined;
};

const resolveName = (state: State, scope: Scope, entry: string, tests: boolean, where: string): RefData | undefined => {
  const pkg = packageOf(entry);
  if (pkg)
    return pkg.pattern === '' || pkg.pattern === 'virtual:' ? fail(state, where, entry, 'a package has a name') : pkg;
  const [head, ...rest] = entry.split('.');
  const top = head === 'top';
  const parts = top ? rest : [head!, ...rest];
  if (parts.length === 0 || parts.length > 2 || !parts.every(isName))
    return fail(state, where, entry, 'a name is a module, a module and one of its surfaces, or an input');
  const whole = parts.join('.');
  const [module, surface] = searchedFrom(scope, top).some((level) => level.names.has(whole))
    ? [whole, undefined]
    : (parts as [string, string | undefined]);
  const name: Name = { module, ...(surface === undefined ? {} : { surface }), top, tests, where, entry };
  const named = moduleRef(state, scope, name);
  if (named !== undefined) return named ?? undefined;
  return inputRef(state, scope, name) ?? outOfScope(state, scope, name);
};

interface Name {
  module: string;
  surface?: string;
  top: boolean;
  tests: boolean;
  where: string;
  entry: string;
}

const levelsOf = (scope: Scope): Scope[] => {
  const levels: Scope[] = [];
  for (let at: Scope | undefined = scope; at; at = at.parent) levels.push(at);
  return levels;
};

const searchedFrom = (scope: Scope, top: boolean): Scope[] => {
  const levels = levelsOf(scope);
  return top ? [levels.at(-1)!] : levels;
};

const moduleRef = (state: State, scope: Scope, name: Name): RefData | null | undefined => {
  const found = searchedFrom(scope, name.top).find((level) => level.names.has(name.module));
  if (!found) return undefined;
  if (found === scope && name.module === scope.own) {
    fail(state, name.where, name.entry, `a module reaches its own files already`);
    return null;
  }
  const up = levelsOf(scope).indexOf(found);
  const ref: RefData = {
    kind: 'module',
    module: name.module,
    ...(name.surface === undefined ? {} : { surface: name.surface }),
    ...(up > 0 ? { up } : {}),
    ...(name.top ? { top: true as const } : {}),
  };
  state.pending.push({ ref, where: name.where, archetype: found.archetype, tests: name.tests });
  return ref;
};

const inputRef = (state: State, scope: Scope, name: Name): RefData | undefined => {
  const isInput = scope.inputs.has(name.module) || (name.tests && scope.testInputs.has(name.module));
  if (name.top || !isInput) return undefined;
  const ref: RefData = {
    kind: 'required',
    name: name.module,
    ...(name.surface === undefined ? {} : { surface: name.surface }),
  };
  state.pending.push({ ref, where: name.where, archetype: scope.archetype, tests: name.tests });
  return ref;
};

const outOfScope = (state: State, scope: Scope, { module, top, tests, where, entry }: Name): undefined => {
  const inputs = top ? [] : [...scope.inputs, ...(tests ? scope.testInputs : [])];
  const names = searchedFrom(scope, top).flatMap((level) =>
    [...level.names].filter((name) => level !== scope || name !== scope.own),
  );
  const inScope = [...new Set([...names, ...inputs])];
  const testInput =
    !tests && scope.testInputs.has(module) ? `; ${module} is a test input, which only test code may name` : '';
  const named = scope.archetype.split('.')[0]!;
  const hints =
    testInput !== ''
      ? []
      : named !== rootName && !top
        ? [`a module outside ${named} comes in through ${named}.requires`]
        : entry === module && /^[\w-]+$/.test(module) && where.endsWith('dependencies')
          ? [`a package is npm:${module}`]
          : [];
  return fail(
    state,
    where,
    entry,
    `no module or input called ${module} here${testInput}; in scope: ${list(inScope.sort(), 'nothing')}` +
      hints.map((hint) => `. ${hint[0]!.toUpperCase()}${hint.slice(1)}`).join(''),
  );
};

const fail = (state: State, where: string, entry: string, problem: string): undefined => {
  state.fail(`${where}: '${entry}': ${problem}`);
  return undefined;
};

const exposes = (
  state: State,
  scope: Scope,
  where: string,
  value: unknown,
  entry: unknown,
  surfacesAllowed: boolean,
  tests: boolean,
): ExposesData | undefined => {
  if (entry !== undefined) {
    if (value !== undefined) state.fail(`${where}: an entry is the module's whole surface; give it entry or exposes`);
    return { kind: 'files', patterns: patterns(state, where.replace(/exposes$/, 'entry'), entry), entry: true };
  }
  if (value === undefined) return undefined;
  if (value === 'all') return { kind: 'all' };
  if (isRecord(value) && Object.keys(value).length === 1 && value.files !== undefined)
    return { kind: 'files', patterns: patterns(state, `${where}.files`, value.files) };
  if (Array.isArray(value) && surfacesAllowed)
    return { kind: 'surfaces', surfaces: surfaces(state, scope, where, value, tests) };
  state.fail(`${where}: expected all, ${surfacesAllowed ? 'a list of its modules, ' : ''}or { files: [...] }`);
  return undefined;
};

const surfaces = (
  state: State,
  scope: Scope,
  where: string,
  value: unknown,
  tests: boolean,
): Record<string, RefData[]> => {
  if (!Array.isArray(value)) {
    state.fail(`${where}: expected a list of its modules, such as [render] or [ui.dsl]`);
    return {};
  }
  const own: Scope = { archetype: scope.archetype, names: scope.names, inputs: new Set(), testInputs: new Set() };
  const result: Record<string, RefData[]> = {};
  for (const [key, entry] of entries(state, where, value)) {
    if (Object.hasOwn(result, key)) state.fail(`${where}: offers '${key}' twice; rename the module at its source`);
    const ref = resolveName(state, own, entry, tests, where);
    if (ref?.kind === 'package') state.fail(`${where}: '${entry}': exposes names the module's own modules`);
    else if (ref) {
      state.pending.at(-1)!.surface = true;
      result[key] = [ref];
    }
  }
  return result;
};
