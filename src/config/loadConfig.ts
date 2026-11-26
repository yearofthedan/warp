import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Document, isAlias, isMap, isNode, isPair, isScalar, parseDocument, visit } from 'yaml';
import { ConfigError } from '../model/configError.ts';

export const configName = 'warp.yaml';

export const findConfig = (dir: string): string => {
  const found = join(dir, configName);
  if (!existsSync(found)) throw new ConfigError(`no config in ${dir}: add a ${configName}`);
  return found;
};

export interface LoadedConfig {
  raw: unknown;
  plugins: Record<string, unknown>;
  lines: ReadonlyMap<string, number>;
  digest: string;
}

export const parseConfig = (text: string, file: string): { raw: unknown; lines: Map<string, number> } => {
  const doc = parseDocument(text, { version: '1.2', merge: false, uniqueKeys: true });
  const lineOf = (offset: number) => text.slice(0, offset).split('\n').length;
  const quoted = new Set<number>();
  const problems = [
    ...doc.errors.map((error) => {
      const [start] = error.pos;
      if (error.code === 'BAD_ALIAS' && text[start] === '*') {
        quoted.add(start);
        return `${file}:${lineOf(start)}: a value that starts with * is quoted, '*'`;
      }
      const key = error.code === 'DUPLICATE_KEY' ? ` (${/^['"]?([^'":\n]*)/.exec(text.slice(start))![1]})` : '';
      return `${file}:${lineOf(start)}: ${firstLine(error.message)}${key}`;
    }),
    ...anchors(doc)
      .filter((offset) => !quoted.has(offset))
      .map((offset) => `${file}:${lineOf(offset)}: anchors and aliases are not part of warp.yaml; write it out`),
  ];
  if (problems.length > 0) throw new ConfigError(problems.join('\n'));
  const lines = new Map<string, number>();
  const walk = (node: unknown, at: (key: string) => Place) => {
    if (!isMap(node)) return;
    for (const pair of node.items.filter(isPair)) {
      if (!isScalar(pair.key)) continue;
      const place = at(String(pair.key.value));
      if (place.path !== undefined) lines.set(place.path, lineOf(pair.key.range?.[0] ?? 0));
      walk(pair.value, place.inside);
    }
  };
  walk(doc.contents, top);
  return { raw: doc.toJS() ?? {}, lines };
};

const firstLine = (message: string): string => message.split('\n')[0]!.replace(/ at line \d+, column \d+:?$/, '');

const anchors = (doc: Document): number[] => {
  const offsets: number[] = [];
  visit(doc, {
    Node: (_, node) => {
      if (isAlias(node) || (isNode(node) && node.anchor)) offsets.push(node.range?.[0] ?? 0);
    },
  });
  return offsets;
};

interface Place {
  path?: string;
  inside: (key: string) => Place;
}

const plain =
  (path: string) =>
  (key: string): Place => ({ path: `${path}.${key}`, inside: plain(`${path}.${key}`) });

const moduleAt = (path: string): Place => ({ path, inside: moduleKey(path) });

const moduleKey =
  (path: string) =>
  (key: string): Place => {
    if (key === 'modules') return { inside: (child) => moduleAt(`${path}.${child}`) };
    if (key === 'test') return { path: `${path}.test`, inside: testKey(path) };
    return plain(path)(key);
  };

const testKey =
  (path: string) =>
  (key: string): Place =>
    key === 'modules' ? { inside: (child) => moduleAt(`${path}.${child}`) } : plain(`${path}.test`)(key);

const top = (key: string): Place => {
  if (key === 'root') return moduleAt('root');
  if (key === 'archetypes') return { inside: moduleAt };
  return { path: key, inside: plain(key) };
};

const entry = new URL(import.meta.url.endsWith('.ts') ? '../index.ts' : '../index.js', import.meta.url).href;
const ownFiles = new URL('../../', import.meta.url).href;

export const loadConfig = async (file: string): Promise<LoadedConfig> => {
  const text = readFileSync(file, 'utf8');
  const digest = createHash('sha256').update(text);
  const name = basename(file);
  const { raw, lines } = parseConfig(text, name);
  const declared = (raw as { plugins?: unknown }).plugins;
  const specs = declared && typeof declared === 'object' && !Array.isArray(declared) ? Object.entries(declared) : [];
  const hooks = registerHooks({
    resolve: (specifier, context, nextResolve) =>
      specifier === '@yearofthedan/warp' ? { url: entry, shortCircuit: true } : nextResolve(specifier, context),
    load: (url, context, nextLoad) => {
      const loaded = nextLoad(url, context);
      if (url.startsWith('file:') && !url.startsWith(ownFiles)) digest.update(url).update(String(loaded.source ?? ''));
      return loaded;
    },
  });
  try {
    const plugins: Record<string, unknown> = {};
    for (const [namespace, spec] of specs) {
      if (typeof spec !== 'string') continue;
      const at = `${name}:${lines.get(`plugins.${namespace}`) ?? 1}: plugins.${namespace}`;
      const path = pluginPath(file, spec, at);
      if (!spec.startsWith('npm:') && !existsSync(path)) throw new ConfigError(`${at}: no file at ${spec}`);
      const module: Record<string, unknown> = await import(pathToFileURL(path).href);
      if (module.default === undefined)
        throw new ConfigError(`${at}: ${spec} has no default export; export the plugin as default`);
      plugins[namespace] = module.default;
    }
    return { raw, plugins, lines, digest: digest.digest('hex') };
  } finally {
    hooks.deregister();
  }
};

const pluginPath = (file: string, spec: string, at: string): string => {
  if (spec.startsWith('npm:')) return createRequire(file).resolve(spec.slice(4));
  if (spec.startsWith('./') || spec.startsWith('../')) return resolve(dirname(file), spec);
  throw new ConfigError(`${at}: '${spec}' is a path, ./${spec}, or a package, npm:${spec}`);
};
