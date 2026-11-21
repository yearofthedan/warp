/**
 * Turns a config built with builder.ts into plain data, checking what the types leave open: self surfaces, and every
 * reference when the config was written without the types. Then checks requirements against providers down the
 * archetype tree, before any file is read.
 */
import { ConfigError } from '../rule.ts';
import { recordedAs } from './builder.ts';
import type { ArchetypeData, ConfigData } from './data.ts';
import { collect, draft } from './draft.ts';
import { type Check, resolveDraft, toRules } from './references.ts';
import { checkRequirements, checkUnused } from './requirements.ts';
import { defined, type Fail, isName, isRecord } from './shared.ts';

export interface LoadedConfigData {
  config: ConfigData;
  /** Provisions that nothing below requires. */
  warnings: string[];
}

export interface LoadOptions {
  /** Rule ids the config may configure. Given, an unknown id is an error, and so is an inline rule that takes one. */
  ruleIds?: Iterable<string>;
  /** Option checks by rule id: a rule's options go through its check, which throws a ConfigError naming `at`. */
  options?: Readonly<Record<string, (raw: Record<string, unknown>, at: string) => unknown>>;
}

/**
 * Checks a config built with `archetype()` and returns it as plain data with its warnings. Throws a ConfigError
 * listing every problem, one per line.
 */
export const loadConfigData = (raw: unknown, { ruleIds, options }: LoadOptions = {}): LoadedConfigData => {
  const errors: string[] = [];
  const fail: Fail = (message) => {
    if (!errors.includes(message)) errors.push(message);
  };
  const failed = () => {
    if (errors.length > 0) throw new ConfigError(errors.join('\n'));
  };
  if (!isRecord(raw)) throw new ConfigError('config: expected an object, defineConfig({ root })');
  const unknownKeys = Object.keys(raw).filter((key) => !['root', 'tsconfig', 'plugins', 'rules'].includes(key));
  if (unknownKeys.length > 0) fail(`config: unknown key ${unknownKeys.join(', ')}`);
  const root = recordedAs(raw.root, 'archetype');
  if (!root) throw new ConfigError("config.root: expected an archetype, archetype('name')...");

  const drafts = [...collect(root, fail)].map(([name, state]) => draft(name, state, fail));
  const check: Check = {
    fail,
    ruleIds: ruleIds && new Set(ruleIds),
    options: options ?? {},
    surfacesOf: (name) => {
      const exposes = drafts.find((d) => d.data.name === name)?.exposes;
      return exposes && Object.keys(exposes);
    },
  };
  // Every archetype's parts and surfaces are known now, so references can be checked against them.
  for (const d of drafts) resolveDraft(check, d);
  const config: ConfigData = defined({
    root: root.name as string,
    archetypes: Object.fromEntries(drafts.map(({ data }) => [data.name, archetypeData(data)])),
    tsconfig: tsconfigs(raw.tsconfig, fail),
    rules: toRules(check, raw.rules, 'config.rules', undefined),
    plugins: plugins(raw.plugins, fail),
  });
  for (const d of drafts) checkUnused(d, fail);
  failed();
  const warnings = checkRequirements(config.archetypes, config.root, fail);
  failed();
  return { config, warnings };
};

/** The archetype's keys in the order the builder chain reads, with absent settings left out. */
const archetypeData = ({
  name,
  description,
  identify,
  requires,
  parts,
  exposes,
  provides,
  loose,
  rules,
}: ArchetypeData) =>
  defined({ name, description, identify, requires, parts: parts.map(defined), exposes, provides, loose, rules });

const plugins = (value: unknown, fail: Fail): Record<string, unknown> => {
  if (value !== undefined && !isRecord(value)) fail('config.plugins: expected plugins by namespace');
  return (value ?? {}) as Record<string, unknown>;
};

const tsconfigs = (value: unknown, fail: Fail): string[] => {
  const paths = [value ?? 'tsconfig.json'].flat();
  if (paths.length === 0 || !paths.every(isName)) fail('config.tsconfig: expected a path or a list of paths');
  return paths as string[];
};
