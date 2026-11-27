import { compileConfig } from '../domain/language/compile.ts';
import { ConfigError } from '../domain/errors/configError.ts';
import type { ConfigData } from '../domain/model/data.ts';
import { pluginRules, pluginRulesets, registry } from '../domain/rules/registry.ts';
import { type Plugin, type Rule, noOptions } from '../domain/rules/rule.ts';
import { type ConfigLines, placeProblems } from './configLines.ts';
import type { ConfigSource } from './ports.ts';

export interface LoadedConfigData {
  config: ConfigData;
  rules: Rule[];
}

export interface LoadOptions {
  builtins?: Plugin;
  file?: string;
  plugins?: Record<string, unknown>;
}

export const loadConfigData = (raw: unknown, { builtins, file, plugins = {} }: LoadOptions = {}): LoadedConfigData => {
  const rules = [...registry([...(builtins?.rules ?? []), ...pluginRules(plugins)]).values()];
  const config = compileConfig(raw, {
    ...(file === undefined ? {} : { file }),
    plugins: Object.keys(plugins),
    rulesets: pluginRulesets(builtins ? { ...plugins, warp: builtins } : plugins),
    ruleIds: builtins && new Set(rules.map((rule) => rule.id)),
    options: Object.fromEntries(rules.map((rule) => [rule.id, rule.parseOptions ?? noOptions])),
    moduleOptions: Object.fromEntries(
      rules.flatMap((rule) => (rule.moduleOptions ? [[rule.id, rule.moduleOptions]] : [])),
    ),
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
