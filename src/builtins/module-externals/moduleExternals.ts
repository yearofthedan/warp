import { place } from '../place.ts';
import type { Grant } from '../../model/archetype/reach.ts';
import type { Model } from '../../model/archetype/resolve.ts';
import type { ExternalImport } from '../../model/facts.ts';
import { type Finding, noOptions, type ProjectRule } from '../../rules/rule.ts';

const id = 'module-externals';

const glob = (pattern: string): RegExp =>
  new RegExp(`^${pattern.replaceAll(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')}$`);

const listsPackage = (pattern: string, external: Pick<ExternalImport, 'package' | 'specifier'>): boolean => {
  const matches = glob(pattern);
  return matches.test(external.package) || matches.test(external.specifier);
};

export const moduleExternals: ProjectRule = {
  id,
  scope: 'project',
  parseOptions: noOptions,
  check: ({ model, verdicts, project, atFile }) =>
    project.files.flatMap((file) => {
      const reach = verdicts.reach(file.path);
      if (!reach || !atFile(file.path).on) return [];
      const packages = reach.filter((grant) => grant.package !== undefined);
      const byPackage = Map.groupBy(file.externals, (external) => external.package);
      return [...byPackage].flatMap(([name, edges]) => {
        const outside = edges.filter((edge) => !packages.some((grant) => listsPackage(grant.package!, edge)));
        return outside.length === 0 ? [] : [refused(model, file.path, name, outside, packages)];
      });
    }),
};

const refused = (
  model: Model,
  from: string,
  name: string,
  edges: ExternalImport[],
  packages: readonly Grant[],
): Finding => {
  const module = model.moduleOf(from)!;
  const owner = model.partOf(from) ?? module.id;
  const names = [...new Set(edges.flatMap((edge) => edge.names))];
  const specifiers = [...new Set(edges.map((edge) => edge.specifier))];
  const imports = edges.every((edge) => edge.typeOnly) ? 'imports types from' : 'imports';
  const uses = Map.groupBy(packages, (grant) => grant.owner);
  const lists =
    uses.size > 0
      ? `: ${[...uses].map(([by, grants]) => `${by} uses ${grants.map((grant) => grant.ref).join(', ')}`).join('; ')}`
      : ': no using in its reach lists a package';
  return {
    rule: id,
    key: `${id}:${from}->${name}`,
    file: from,
    line: edges[0]!.line,
    value: Math.max(1, names.length),
    message:
      `${from} (${place(model, from, module)}) ${imports} ${specifiers.join(', ')}, a package outside ${owner}'s reach${lists}. ` +
      `Add pkg('${name}') to a using if the dependency is intended, or move the code.`,
    details: { from: { module: module.id, part: model.partOf(from) }, package: name, edges },
  };
};
