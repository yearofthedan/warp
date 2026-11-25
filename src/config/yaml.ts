// why: spike only, to see whether the YAML language maps onto ConfigData; not wired for release.
// until: the YAML spike's findings are decided; the branch is not for merging
import { parseDocument } from 'yaml';
import { all, archetype, contains, dir, exposes, files, pkg, ruleset } from '../model/archetype/builder.ts';
import { ConfigError } from '../model/configError.ts';

type Node = Record<string, unknown>;
type Builder = Record<string, (...args: unknown[]) => Builder> & { modules: Record<string, unknown> };

const record = (value: unknown): Node =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Node) : {};
const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : value === undefined ? [] : [String(value)];
const entries = (value: unknown): [string, string][] =>
  Array.isArray(value)
    ? value.map((name) => [String(name).split('.').at(-1)!, String(name)])
    : Object.entries(record(value)).map(([k, v]) => [k, String(v)]);

const notes: string[] = [];
// Names test code reaches outside its holder; the enclosing archetype provides them, as warp has no other way in.
const testOuter = new Set<string>();
const note = (message: string) => {
  if (!notes.includes(message)) notes.push(message);
};

// A scope is the names a `dependencies` entry may use: sibling modules, and the archetype's inputs.
interface Scope {
  siblings: Set<string>;
  inputs: Set<string>;
  nested: boolean;
  test?: boolean;
  defs?: Node;
}

const isPackage = (name: string) => /^(npm|node|virtual):/.test(name);
const packageOf = (name: string) => pkg(name.startsWith('npm:') ? name.slice(4) : name);

// Turns dependency names into builder refs for `(m, required)`. Names it cannot reach in this scope are returned as hoisted.
const refs = (names: string[], scope: Scope, m: Node, required: Node) => {
  const out: unknown[] = [];
  const hoisted: string[] = [];
  for (const name of names) {
    if (isPackage(name)) {
      out.push(packageOf(name));
      continue;
    }
    const [head, ...rest] = name.split('.');
    if (head === 'top') {
      if (scope.nested) note(`top.${rest.join('.')}: dropped; test code already reaches its holder's modules`);
      else out.push(path(m, rest));
      continue;
    }
    if (!scope.nested && !scope.siblings.has(head!) && !scope.inputs.has(head!))
      throw new ConfigError(
        `dependencies name '${name}', which is no module here and no input; in scope: ${[...scope.siblings, ...scope.inputs].sort().join(', ')}`,
      );
    if (scope.siblings.has(head!)) out.push(path(m, [head!, ...rest]));
    else if (scope.inputs.has(head!)) out.push(path(required, [head!, ...rest]));
    else if (scope.test) {
      testOuter.add(name);
      note(
        `test code names '${name}' outside its inline holder; widened to the archetype's test.provides (warp has no narrower way)`,
      );
    } else hoisted.push(name);
  }
  return { out, hoisted };
};

const path = (root: Node, parts: string[]): unknown => parts.reduce<unknown>((at, part) => record(at)[part], root);

const selector = (def: Node) => {
  if (def.dir !== undefined) {
    const p = String(def.dir);
    return dir(p === '*' ? '{name}' : p);
  }
  if (def.files !== undefined) return (files as (...p: string[]) => unknown)(...list(def.files));
  throw new ConfigError(`module: expected dir or files, got ${JSON.stringify(def)}`);
};

const exposesValue = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === 'all') return all();
  if (!Array.isArray(value) && record(value).files !== undefined)
    return (files as (...p: string[]) => unknown)(...list(record(value).files));
  const named = entries(value);
  const seen = new Set<string>();
  for (const [name] of named) {
    if (seen.has(name))
      throw new ConfigError(
        `exposes [${list(value).join(', ')}] offers '${name}' twice; rename the module at its source`,
      );
    seen.add(name);
  }
  return (m: Node) => Object.fromEntries(named.map(([name, target]) => [name, path(m, target.split('.'))]));
};

interface Built {
  archetypes: Map<string, Builder>;
  defs: Node;
  rootDef: Node;
}

// Builds the third argument of `.module()` / `.testModule()` for an inline module: its own exposes, children and using.
const inline = (built: Built, def: Node, scope: Scope, test: boolean): unknown => {
  const testBlock = record(def.test);
  const childModules = record(def.modules);
  const testModules = def.files === undefined ? record(testBlock.modules) : {};
  const hasChildren = Object.keys(childModules).length + Object.keys(testModules).length > 0;
  const own = list(def.dependencies);
  let b: Builder = (
    hasChildren ? contains((c: unknown) => children(built, c, childModules, testModules, def, test)) : archetype()
  ) as never;
  const exp = test ? undefined : exposesValue(def.exposes);
  if (exp !== undefined) b = b.exposes(exp);
  if (testBlock.provides !== undefined) {
    const names = list(testBlock.provides);
    b = b.testUsing(
      (m: Node) =>
        refs(names, { siblings: names2(childModules, testModules), inputs: new Set(), nested: true }, m, {}).out,
    );
  }
  if (testBlock.exposes !== undefined) b = b.testExposes(exposesValue(testBlock.exposes));
  const hoisted = [...collectHoisted(built, childModules, scope, testModules)];
  const using = [...own, ...hoisted];
  if (using.length > 0) b = b.using((m: Node, ctx?: Node) => refs(using, scope, m, record(record(ctx).required)).out);
  return b;
};

// warp's model wants a module declared before the siblings that use it; YAML has no order, so sort by dependencies.
const ordered = (modules: Node): [string, Node][] => {
  const names = Object.keys(modules);
  const done: string[] = [];
  const visit = (name: string, seen: Set<string>) => {
    if (done.includes(name) || seen.has(name)) return;
    seen.add(name);
    const m = record(modules[name]);
    for (const ref of [...list(m.dependencies), ...entries(m.dependencies).map(([, v]) => v)]) {
      const head = ref.split('.')[0]!;
      if (head !== name && names.includes(head)) visit(head, seen);
    }
    done.push(name);
  };
  for (const name of names) visit(name, new Set());
  return done.map((name) => [name, record(modules[name])]);
};

// warp's model gives a files module no children; lift its test modules to the holder, given the files module.
const lifted = (modules: Node, testModules: Node): Node => {
  const out: Node = { ...testModules };
  for (const [name, raw] of Object.entries(modules)) {
    const m = record(raw);
    if (m.files === undefined) continue;
    for (const [testName, t] of Object.entries(record(record(m.test).modules))) {
      const lift = `${name}${testName[0]!.toUpperCase()}${testName.slice(1)}`;
      note(`${name}.test.${testName}: lifted to its holder as ${lift}; a files module cannot hold test modules`);
      out[lift] = record(t);
    }
  }
  return out;
};

const names2 = (a: Node, b: Node) => new Set([...Object.keys(a), ...Object.keys(b)]);

// Children of an inline module name things outside it; warp's model has no path out, so hoist them to the holder.
const collectHoisted = function* (
  built: Built,
  childModules: Node,
  outer: Scope,
  testModules: Node,
): Generator<string> {
  const inner = names2(childModules, testModules);
  for (const [name, child] of Object.entries(childModules)) {
    for (const ref of list(record(child).dependencies)) {
      const head = ref.split('.')[0]!;
      if (isPackage(ref) || inner.has(head) || head === 'top') continue;
      note(`${name}: '${ref}' hoisted to its holder; a child of an inline module cannot name the holder's siblings`);
      yield ref;
    }
  }
  void built;
  void outer;
};

const children = (
  built: Built,
  c: unknown,
  modules: Node,
  testModules: Node,
  holderDef: Node,
  holderTest: boolean,
): unknown => {
  void holderDef;
  const scope: Scope = { siblings: names2(modules, testModules), inputs: new Set(), nested: true, defs: modules };
  let at = c as Builder;
  for (const [name, raw] of ordered(modules))
    at = at.module(name, selector(raw), inline(built, raw, scope, holderTest));
  for (const [name, raw] of ordered(testModules))
    at = at.testModule(name, selector(record(raw)), testInline(built, record(raw), scope));
  return at;
};

const testInline = (built: Built, def: Node, scope: Scope): unknown => {
  const kids = record(def.modules);
  const own = list(def.dependencies);
  let b: Builder = (
    Object.keys(kids).length > 0
      ? contains((c: unknown) => {
          let at = c as Builder;
          const inner: Scope = { siblings: new Set(Object.keys(kids)), inputs: new Set(), nested: true };
          for (const [name, raw] of Object.entries(kids))
            at = at.testModule(name, selector(record(raw)), testInline(built, record(raw), inner));
          return at;
        })
      : archetype()
  ) as never;
  if (own.length > 0)
    b = b.using((m: Node, ctx?: Node) => refs(own, { ...scope, test: true }, m, record(record(ctx).required)).out);
  return b;
};

// A named archetype, built once; its call sites' `dependencies` become `provides` on the holder.
const named = (built: Built, name: string): Builder => {
  const existing = built.archetypes.get(name);
  if (existing) return existing;
  const def = record(record(built.defs)[name]);
  const placeholder = archetype(name) as never as Builder;
  built.archetypes.set(name, placeholder);
  const result = shape(built, name, def, false);
  built.archetypes.set(name, result);
  return result;
};

const shape = (built: Built, name: string, def: Node, isRoot: boolean): Builder => {
  const testBlock = record(def.test);
  const modules = record(def.modules);
  const testModules = lifted(modules, record(testBlock.modules));
  const usedInputs = new Set(
    [...Object.values(modules), ...Object.values(testModules)]
      .filter((m) => record(m).archetype === undefined)
      .flatMap((m) => list(record(m).dependencies).map((n) => n.split('.')[0]!)),
  );
  const inputs = [...list(def.requires), ...list(testBlock.requires)];
  const kept = inputs.filter((input) => usedInputs.has(input));
  for (const input of inputs.filter((input) => !usedInputs.has(input)))
    note(`${name} requires ${input} only to pass it on; dropped, warp finds it above anyway`);
  const scope: Scope = { siblings: names2(modules, testModules), inputs: new Set(kept), nested: false, defs: modules };
  let b = archetype(name) as never as Builder;
  if (def.description) b = b.description(String(def.description));
  if (def.marker) b = b.identify({ marker: String(def.marker) });
  if (kept.length > 0) b = b.requires(Object.fromEntries(kept.map((input) => [input, kindOf(built, name, input)])));
  const provides = new Map<string, string>();
  b = b.contains((c: unknown, ctx: unknown) => {
    const required = record(record(ctx).required);
    let at = c as Builder;
    for (const [moduleName, m] of ordered(modules)) {
      if (m.archetype !== undefined) {
        const target = String(m.archetype) === name ? record(ctx).self : named(built, String(m.archetype));
        for (const [input, ref] of [...entries(m.dependencies), ...entries(record(m.test).dependencies)]) {
          const head = ref.split('.')[0]!;
          if (scope.siblings.has(head)) provides.set(input, ref);
        }
        at = at.module(moduleName, selector(m), target);
      } else at = at.module(moduleName, selector(m), inline(built, m, scope, false));
    }
    for (const [moduleName, raw] of ordered(testModules))
      at = at.testModule(moduleName, selector(record(raw)), testInline(built, record(raw), scope));
    void required;
    return at;
  });
  const exp = exposesValue(def.exposes);
  if (exp !== undefined) b = b.exposes(exp);
  if (testBlock.exposes !== undefined) b = b.testExposes(exposesValue(testBlock.exposes));
  if (provides.size > 0)
    b = b.provides((m: Node) =>
      Object.fromEntries([...provides].map(([input, ref]) => [input, path(m, ref.split('.'))])),
    );
  const widened = Object.values(modules)
    .map(record)
    .filter((m) => m.archetype === undefined)
    .flatMap((m) => {
      const own = names2(record(m.modules), record(record(m.test).modules));
      return Object.values(record(record(m.test).modules)).flatMap((t) =>
        list(record(t).dependencies).filter(
          (ref) => !isPackage(ref) && !own.has(ref.split('.')[0]!) && scope.siblings.has(ref.split('.')[0]!),
        ),
      );
    });
  const kit = [...new Set([...list(testBlock.provides), ...widened])];
  if (kit.length > 0) b = b.testUsing((m: Node) => refs(kit, scope, m, {}).out);
  void isRoot;
  return b;
};

// warp's requires carry a shape (dir or files); the YAML names inputs only, so read the shape off what binds them.
const kindOf = (built: Built, archetypeName: string, input: string): unknown => {
  const defs = record(built.defs);
  for (const def of [...Object.values(defs), built.rootDef]) {
    for (const raw of Object.values(record(record(def).modules))) {
      const m = record(raw);
      if (String(m.archetype) !== archetypeName) continue;
      const bound = [...entries(m.dependencies), ...entries(record(m.test).dependencies)].find(
        ([name]) => name === input,
      )?.[1];
      if (!bound) continue;
      const target = record(record(record(def).modules)[bound.split('.')[0]!]);
      if (target.files !== undefined) return files();
      if (target.dir !== undefined) return dir();
    }
  }
  return dir();
};

export interface Translated {
  raw: unknown;
  notes: string[];
}

export const translateYaml = (text: string, file: string): Translated => {
  const doc = parseDocument(text, { version: '1.2' });
  if (doc.errors.length > 0) throw new ConfigError(`${file}: ${doc.errors.map((error) => error.message).join('\n')}`);
  const data = record(doc.toJS());
  notes.length = 0;
  testOuter.clear();
  const built: Built = { archetypes: new Map(), defs: record(data.archetypes), rootDef: record(data.root) };
  const root = shape(built, 'root', record(data.root), true);
  const rulesets = Object.fromEntries(
    Object.entries(record(data.rulesets)).map(([name, raw]) => {
      const settings = record(raw);
      let r = ruleset() as never as Builder;
      const test =
        settings.test === undefined
          ? undefined
          : Object.fromEntries(
              Object.entries(record(settings.test)).map(([k, v]) => [k, v === 'off' ? false : v === 'on' ? true : v]),
            );
      if (test !== undefined) {
        const owners: [Builder, Node][] = [
          [root, record(data.root)],
          ...[...built.archetypes].map(([n, b]) => [b, record(built.defs[n])] as [Builder, Node]),
        ];
        for (const [builder, def] of owners)
          for (const handle of testHandles(builder.modules, def)) if (handle) r = r.on(handle, test);
      }
      for (const target of Object.keys(record(settings.on))) note(`rulesets.on ${target}: not translated in the spike`);
      return [name, r];
    }),
  );
  return { raw: { root, rulesets }, notes: [...notes] };
};

// The handles of every test module a definition declares, inline children included.
const testHandles = function* (handles: Record<string, unknown>, def: Node): Generator<unknown> {
  for (const name of Object.keys(record(record(def.test).modules))) yield handles[name];
  for (const [name, raw] of Object.entries(record(def.modules))) {
    const nested = record(record(handles[name]).modules);
    if (record(raw).archetype === undefined) yield* testHandles(nested, record(raw));
  }
};
