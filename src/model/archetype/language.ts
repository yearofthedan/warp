import type {
  ArchetypeData,
  DirModuleData,
  ExposesData,
  FilesModuleData,
  ModuleData,
  PackageRefData,
  RefData,
  TestModuleData,
} from './data.ts';
import { type Fail, isName, isRecord, list } from './shared.ts';

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
}

export const rootName = 'root';

const moduleKeys = ['description', 'dir', 'files', 'entry', 'archetype', 'dependencies', 'exposes', 'modules', 'test'];
const archetypeKeys = ['description', 'marker', 'requires', 'entry', 'exposes', 'modules', 'test'];
const rootKeys = ['description', 'modules', 'test'];
const testKeys = ['requires', 'dependencies', 'provides', 'exposes', 'modules'];
const testModuleKeys = ['description', 'dir', 'files', 'archetype', 'dependencies', 'exposes', 'modules'];

export const parseStructure = (root: unknown, archetypes: unknown, fail: Fail): Structure => {
  const defs = archetypes === undefined ? {} : isRecord(archetypes) ? archetypes : {};
  if (archetypes !== undefined && !isRecord(archetypes)) fail('archetypes: expected archetypes by name');
  const state: State = { defs, archetypes: {}, pending: [], fail };
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
    state.fail(
      `${where}: unknown key ${key}; a ${keys === testKeys ? 'test block' : 'module'} takes ${keys.join(', ')}`,
    );
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
  const named = options.parent === undefined;
  const test = isRecord(def.test) ? def.test : {};
  if (def.test !== undefined && !isRecord(def.test)) state.fail(`${where}.test: expected a test block`);
  const requires = named ? strings(state, `${where}.requires`, def.requires) : [];
  const testRequires = named ? strings(state, `${where}.test.requires`, test.requires) : [];
  if (!named && test.requires !== undefined)
    state.fail(`${where}.test.requires: only an archetype requires; its modules see what it requires`);
  const modules = def.modules === undefined ? {} : record(state, `${where}.modules`, def.modules);
  const testModules = test.modules === undefined ? {} : record(state, `${where}.test.modules`, test.modules);
  const filesTests = Object.entries(modules).flatMap(([module, raw]) =>
    isRecord(raw) && raw.files !== undefined && isRecord(raw.test) && isRecord(raw.test.modules)
      ? Object.keys(raw.test.modules).map((inner) => `${module}.${inner}`)
      : [],
  );
  const scope: Scope = {
    archetype: name,
    names: new Set([...Object.keys(modules), ...Object.keys(testModules), ...filesTests]),
    ...(options.parent ? { parent: options.parent } : {}),
    inputs: named ? new Set(requires) : options.parent!.inputs,
    testInputs: named ? new Set(testRequires) : options.parent!.testInputs,
  };
  const data: ArchetypeData = {
    name,
    ...(named ? {} : { inline: true as const }),
    ...(options.test ? { test: true as const } : {}),
    ...(named ? description(state, where, def.description) : {}),
    requires,
    ...(testRequires.length > 0 ? { testRequires } : {}),
    modules: [],
  };
  if (named && def.marker !== undefined) {
    if (isName(def.marker)) data.identify = { marker: def.marker };
    else state.fail(`${where}.marker: expected a file pattern, such as '{name}.dom.ts'`);
  }
  for (const key of Object.keys(test).filter((key) => !testKeys.includes(key)))
    state.fail(`${where}.test: unknown key ${key}; a test block takes ${testKeys.join(', ')}`);
  if (test.dependencies !== undefined)
    state.fail(`${where}.test.dependencies: fills an archetype's test.requires, where a module uses one`);
  state.archetypes[name] = data;
  for (const [module, raw] of Object.entries(modules)) {
    const built = options.test ? testModule(state, scope, module, raw) : productionModule(state, scope, module, raw);
    data.modules.push(...built);
  }
  for (const [module, raw] of Object.entries(testModules)) data.modules.push(...testModule(state, scope, module, raw));
  const exposed = exposes(state, scope, `${where}.exposes`, def.exposes, def.entry, true, options.test === true);
  if (exposed) data.exposes = exposed;
  if (test.exposes !== undefined) {
    if (options.test) state.fail(`${where}.test.exposes: ${where} is test code; what it exposes is for tests already`);
    else data.testExposes = surfaces(state, scope, `${where}.test.exposes`, test.exposes, true);
  }
  if (test.provides !== undefined) {
    if (options.test) state.fail(`${where}.test.provides: ${where} is test code; give its modules dependencies`);
    else data.testUsing = references(state, scope, `${where}.test.provides`, test.provides, true);
  }
  return data;
};

const nameProblem = (name: string): boolean => !isName(name) || name.includes('.');

const productionModule = (state: State, scope: Scope, name: string, raw: unknown): ModuleData[] => {
  const where = `${scope.archetype}.${name}`;
  const def = record(state, where, raw);
  if (nameProblem(name)) state.fail(`${scope.archetype}: a module's name has no dots, not '${name}'`);
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
  if (nameProblem(name)) state.fail(`${scope.archetype}: a module's name has no dots, not '${name}'`);
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
    locator: { kind: 'files', patterns: patterns(state, `${where}.files`, def.files) },
    ...(of === undefined ? {} : { of }),
    using: references(state, scope, `${where}.dependencies`, def.dependencies, true),
    ...(exposed && exposed.kind !== 'surfaces' ? { exposes: exposed } : {}),
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
  for (const key of Object.keys(testBlock).filter((key) => key !== 'dependencies'))
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
  const module: FilesModuleData = {
    kind: 'files',
    name,
    patterns: patterns(state, `${where}.files`, def.files),
    using: references(state, scope, `${where}.dependencies`, def.dependencies, false),
    ...(exposed && exposed.kind !== 'surfaces' ? { exposes: exposed } : {}),
    ...description(state, where, def.description),
  };
  const test = isRecord(def.test) ? def.test : {};
  for (const key of Object.keys(test).filter((key) => key !== 'modules'))
    state.fail(`${where}.test.${key}: a files module's test block holds its test modules only`);
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

// A list entry is a name or a path, kept under its last part; a map binds an entry under its key.
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
  const [module, surface] = parts as [string, string | undefined];
  const levels: Scope[] = [];
  for (let at: Scope | undefined = scope; at; at = at.parent) levels.push(at);
  const searched = top ? [levels.at(-1)!] : levels;
  const found = searched.find((level) => level.names.has(module));
  if (found) {
    if (found === scope && module === scope.own && !top)
      return fail(state, where, entry, `a module reaches its own files already`);
    const up = levels.indexOf(found);
    const ref: RefData = {
      kind: 'module',
      module,
      ...(surface === undefined ? {} : { surface }),
      ...(up > 0 ? { up } : {}),
    };
    state.pending.push({ ref, where, archetype: found.archetype, tests });
    return ref;
  }
  if (!top && (scope.inputs.has(module) || (tests && scope.testInputs.has(module)))) {
    const ref: RefData = { kind: 'required', name: module, ...(surface === undefined ? {} : { surface }) };
    state.pending.push({ ref, where, archetype: scope.archetype, tests });
    return ref;
  }
  const inScope = [
    ...new Set([...levels.flatMap((level) => [...level.names]), ...scope.inputs, ...(tests ? scope.testInputs : [])]),
  ];
  const testInput =
    !tests && scope.testInputs.has(module) ? `; ${module} is a test input, which only test code may name` : '';
  return fail(
    state,
    where,
    entry,
    `no module or input called ${module} here${testInput}; in scope: ${list(inScope.sort(), 'nothing')}`,
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
