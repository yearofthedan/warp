import { compileConfig } from '../domain/language/compile.ts';
import type { ConfigData } from '../domain/model/data.ts';
import { pluginRules, registry } from '../domain/rules/registry.ts';
import { type Rule, noOptions } from '../domain/rules/rule.ts';

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
