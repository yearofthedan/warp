import { compileConfig } from '../domain/language/compile.ts';
import { ConfigError } from '../domain/model/configError.ts';
import type { ConfigData } from '../domain/model/data.ts';
import { pluginRules, registry } from '../domain/rules/registry.ts';
import { type Rule, noOptions } from '../domain/rules/rule.ts';
import { type ConfigLines, placeProblems } from './configLines.ts';
import type { ConfigSource } from './ports.ts';

export interface LoadedConfigData {
  config: ConfigData;
  rules: Rule[];
}

export interface LoadOptions {
  builtins?: readonly Rule[];
  ruleset?: string;
  file?: string;
  plugins?: Record<string, unknown>;
}

export const loadConfigData = (
  raw: unknown,
  { builtins, ruleset, file, plugins = {} }: LoadOptions = {},
): LoadedConfigData => {
  const rules = [...registry([...(builtins ?? []), ...pluginRules(plugins)]).values()];
  const config = compileConfig(raw, {
    ...(file === undefined ? {} : { file }),
    ruleset,
    plugins: Object.keys(plugins),
    ruleIds: builtins && new Set(rules.map((rule) => rule.id)),
    options: Object.fromEntries(rules.map((rule) => [rule.id, rule.parseOptions ?? noOptions])),
  });
  return { config, rules };
};

export interface LoadedConfig extends LoadedConfigData {
  lines: ConfigLines;
  digest: string;
}

export const loadConfig = async (
  source: ConfigSource,
  options: Omit<LoadOptions, 'file' | 'plugins'> = {},
): Promise<LoadedConfig> => {
  const { raw, plugins, lines, digest } = await source.read();
  try {
    return { ...loadConfigData(raw, { ...options, plugins, file: source.file }), lines, digest };
  } catch (error) {
    if (error instanceof ConfigError) throw new ConfigError(placeProblems(lines, source.file, error.message));
    throw error;
  }
};
