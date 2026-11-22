import { pluginRules, registry } from '../registry.ts';
import { type Rule, ConfigError, noOptions } from '../rule.ts';
import { recordedAs } from './builder.ts';
import type { ArchetypeData, ConfigData } from './data.ts';
import { collect, draft } from './draft.ts';
import { type Check, resolveDraft, toRules } from './references.ts';
import { checkRequirements, checkUnused } from './requirements.ts';
import { unclassified } from './unclassified.ts';
import { withRuleset } from './rulesets.ts';
import { defined, type Fail, isName, isRecord } from './shared.ts';

export interface LoadedConfigData {
  config: ConfigData;
  rules: Rule[];
  warnings: string[];
}

export interface LoadOptions {
  builtins?: readonly Rule[];
  ruleset?: string;
}

export const loadConfigData = (raw: unknown, { builtins, ruleset }: LoadOptions = {}): LoadedConfigData => {
  const errors: string[] = [];
  const fail: Fail = (message) => {
    if (!errors.includes(message)) errors.push(message);
  };
  const failed = () => {
    if (errors.length > 0) throw new ConfigError(errors.join('\n'));
  };
  if (!isRecord(raw)) throw new ConfigError('config: expected an object, defineConfig({ root })');
  const unknownKeys = Object.keys(raw).filter((key) => !['root', 'tsconfig', 'plugins', 'rulesets'].includes(key));
  if (unknownKeys.length > 0) fail(`config: unknown key ${unknownKeys.join(', ')}`);
  const root = recordedAs(raw.root, 'archetype');
  if (!root) throw new ConfigError("config.root: expected an archetype, archetype('name')...");

  const rules = [...registry([...(builtins ?? []), ...pluginRules(plugins(raw.plugins, fail))]).values()];
  const drafts = [...collect(root, fail)].map(([name, state]) => draft(name, state, fail));
  const check: Check = {
    fail,
    ruleIds: builtins && new Set([...rules.map((rule) => rule.id), unclassified]),
    options: Object.fromEntries(rules.map((rule) => [rule.id, rule.parseOptions ?? noOptions])),
    surfacesOf: (name) => {
      const exposes = drafts.find((d) => d.data.name === name)?.exposes;
      return exposes && Object.keys(exposes);
    },
  };
  for (const d of drafts) resolveDraft(check, d);
  const structure: ConfigData = {
    root: root.name as string,
    archetypes: Object.fromEntries(drafts.map(({ data }) => [data.name, archetypeData(data)])),
    tsconfig: tsconfigs(raw.tsconfig, fail),
  };
  const config = withRuleset(structure, raw.rulesets, ruleset, (value, at) => toRules(check, value, at), fail);
  for (const d of drafts) checkUnused(d, fail);
  failed();
  const warnings = checkRequirements(config.archetypes, config.root, fail);
  failed();
  return { config, rules, warnings };
};

const archetypeData = ({ name, description, identify, requires, parts, exposes, provides }: ArchetypeData) =>
  defined({ name, description, identify, requires, parts: parts.map(defined), exposes, provides });

const plugins = (value: unknown, fail: Fail): Record<string, unknown> => {
  if (value === undefined) return {};
  if (isRecord(value)) return value;
  fail('config.plugins: expected plugins by namespace');
  return {};
};

const tsconfigs = (value: unknown, fail: Fail): string[] => {
  const paths = [value ?? 'tsconfig.json'].flat();
  if (paths.length === 0 || !paths.every(isName)) fail('config.tsconfig: expected a path or a list of paths');
  return paths as string[];
};
