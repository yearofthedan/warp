import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isAlias, isMap, isNode, isPair, isScalar, parseDocument, visit } from 'yaml';
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
  const problems = doc.errors.map((error) => `${file}:${lineOf(error.pos[0])}: ${error.message.split('\n')[0]}`);
  visit(doc, {
    Node: (_, node) => {
      if (isAlias(node) || (isNode(node) && node.anchor))
        problems.push(
          `${file}:${lineOf(node.range?.[0] ?? 0)}: anchors and aliases are not part of warp.yaml; write it out`,
        );
    },
  });
  if (problems.length > 0) throw new ConfigError(problems.join('\n'));
  const lines = new Map<string, number>();
  const walk = (node: unknown, path: string) => {
    if (!isMap(node)) return;
    for (const pair of node.items) {
      if (!isPair(pair) || !isScalar(pair.key)) continue;
      const at = path === '' ? String(pair.key.value) : `${path}.${String(pair.key.value)}`;
      lines.set(at, lineOf(pair.key.range?.[0] ?? 0));
      walk(pair.value, at);
    }
  };
  walk(doc.contents, '');
  return { raw: doc.toJS() ?? {}, lines };
};

export const loadConfig = async (file: string): Promise<LoadedConfig> => {
  const text = readFileSync(file, 'utf8');
  const digest = createHash('sha256').update(text);
  const { raw, lines } = parseConfig(text, file);
  const declared = (raw as { plugins?: unknown }).plugins;
  const plugins: Record<string, unknown> = {};
  if (declared && typeof declared === 'object' && !Array.isArray(declared))
    for (const [namespace, spec] of Object.entries(declared)) {
      if (typeof spec !== 'string') continue;
      const path = pluginPath(file, spec);
      digest.update(path).update(readFileSync(path));
      const module: Record<string, unknown> = await import(pathToFileURL(path).href);
      if (module.default === undefined)
        throw new ConfigError(
          `${file}: plugins.${namespace}: ${spec} has no default export; export the plugin as default`,
        );
      plugins[namespace] = module.default;
    }
  return { raw, plugins, lines, digest: digest.digest('hex') };
};

const pluginPath = (file: string, spec: string): string => {
  if (spec.startsWith('npm:')) return createRequire(file).resolve(spec.slice(4));
  if (spec.startsWith('./') || spec.startsWith('../')) return resolve(dirname(file), spec);
  throw new ConfigError(`${file}: plugin '${spec}': name a path, ./rules/x.ts, or a package, npm:x`);
};
