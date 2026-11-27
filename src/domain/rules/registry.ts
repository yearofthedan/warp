import { ConfigError } from '../errors/configError.ts';
import type { Rule, Finding, FileContext, ProjectContext } from './rule.ts';

export const registry = <R extends { id: string }>(rules: readonly R[]): ReadonlyMap<string, R> => {
  const byId = new Map<string, R>();
  for (const rule of rules) {
    if (byId.has(rule.id)) throw new ConfigError(`rules: two rules have the id ${rule.id}`);
    byId.set(rule.id, rule);
  }
  return byId;
};

const name = /^[a-z][a-z0-9-]*$/;

export const pluginRulesets = (plugins: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(plugins).flatMap(([namespace, plugin]) => {
      const rulesets = (plugin as { rulesets?: unknown }).rulesets;
      if (rulesets === undefined) return [];
      if (typeof rulesets !== 'object' || rulesets === null || Array.isArray(rulesets))
        throw new ConfigError(`plugins.${namespace}: expected rulesets by name, { recommended: { rules: {...} } }`);
      return Object.entries(rulesets).map(([ruleset, definition]) => [`${namespace}:${ruleset}`, definition]);
    }),
  );

export const pluginRules = (plugins: Record<string, unknown>): Rule[] =>
  Object.entries(plugins).flatMap(([namespace, plugin]) => namespaced(namespace, plugin, `plugins.${namespace}`));

const namespaced = (namespace: string, plugin: unknown, at: string): Rule[] => {
  if (!name.test(namespace)) throw new ConfigError(`${at}: a namespace is lowercase letters, digits and dashes`);
  if (namespace === 'warp')
    throw new ConfigError(`${at}: warp is the namespace of warp's own rulesets; name it otherwise`);
  const rules = typeof plugin === 'object' && plugin !== null ? (plugin as { rules?: unknown }).rules : undefined;
  if (!Array.isArray(rules))
    throw new ConfigError(`${at}: expected a plugin, { rules: Rule[] }, as the default export of its file`);
  return rules.map((rule: Rule, index): Rule => {
    const where = `${at}.rules[${index}]`;
    if (typeof rule?.id !== 'string' || !name.test(rule.id))
      throw new ConfigError(`${where}: a rule id is lowercase letters, digits and dashes`);
    if (typeof rule.check !== 'function') throw new ConfigError(`${where}: ${rule.id} has no check function`);
    if (rule.scope !== undefined && rule.scope !== 'file' && rule.scope !== 'project')
      throw new ConfigError(`${where}: ${rule.id} has scope ${String(rule.scope)}; a scope is file or project`);
    const id = `${namespace}/${rule.id}`;
    const owned = (findings: Finding[]) =>
      findings.map((finding) => ({ ...finding, rule: id, key: `${namespace}/${finding.key}` }));
    if (rule.scope === 'project')
      return { ...rule, id, check: (context: ProjectContext<any>) => owned(rule.check(context)) };
    return { ...rule, id, check: (context: FileContext<any>) => owned(rule.check(context)) };
  });
};
