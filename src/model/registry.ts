import { type ArchetypeRule, ConfigError, type Finding, type ModuleContext, type ProjectContext } from './rule.ts';

export const registry = <R extends { id: string }>(rules: readonly R[]): ReadonlyMap<string, R> => {
  const byId = new Map<string, R>();
  for (const rule of rules) {
    if (byId.has(rule.id)) throw new ConfigError(`rules: two rules have the id ${rule.id}`);
    byId.set(rule.id, rule);
  }
  return byId;
};

const name = /^[a-z][a-z0-9-]*$/;

export const pluginRules = (plugins: Record<string, unknown>): ArchetypeRule[] =>
  Object.entries(plugins).flatMap(([namespace, plugin]) =>
    namespaced(namespace, plugin, `config.plugins.${namespace}`),
  );

const namespaced = (namespace: string, plugin: unknown, at: string): ArchetypeRule[] => {
  if (!name.test(namespace)) throw new ConfigError(`${at}: a namespace is lowercase letters, digits and dashes`);
  const rules = typeof plugin === 'object' && plugin !== null ? (plugin as { rules?: unknown }).rules : undefined;
  if (!Array.isArray(rules))
    throw new ConfigError(`${at}: expected a plugin, { rules: Rule[] }, imported in a warp.config.ts`);
  return rules.map((rule: ArchetypeRule, index): ArchetypeRule => {
    const where = `${at}.rules[${index}]`;
    if (typeof rule?.id !== 'string' || !name.test(rule.id))
      throw new ConfigError(`${where}: a rule id is lowercase letters, digits and dashes`);
    if (typeof rule.check !== 'function') throw new ConfigError(`${where}: ${rule.id} has no check function`);
    if (rule.scope !== undefined && rule.scope !== 'module' && rule.scope !== 'project')
      throw new ConfigError(`${where}: ${rule.id} has scope ${String(rule.scope)}; a scope is module or project`);
    const id = `${namespace}/${rule.id}`;
    const owned = (findings: Finding[]) =>
      findings.map((finding) => ({ ...finding, rule: id, key: `${namespace}/${finding.key}` }));
    if (rule.scope === 'project')
      return { ...rule, id, check: (context: ProjectContext<any>) => owned(rule.check(context)) };
    return { ...rule, id, check: (context: ModuleContext<any>) => owned(rule.check(context)) };
  });
};
