import type { ExternalImport, Project } from '../facts.ts';
import type { Finding } from '../rule.ts';
import { place } from './direction.ts';
import type { Grant, Verdicts } from './reach.ts';
import type { Model } from './resolve.ts';

const id = 'unit-externals';

const glob = (pattern: string): RegExp =>
  new RegExp(`^${pattern.replaceAll(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')}$`);

const listsPackage = (pattern: string, external: Pick<ExternalImport, 'package' | 'specifier'>): boolean => {
  const matches = glob(pattern);
  return matches.test(external.package) || matches.test(external.specifier);
};

export const externalFindings = (model: Model, verdicts: Verdicts, project: Project, docs?: string): Finding[] =>
  project.modules.flatMap((module) => {
    const reach = verdicts.reach(module.file);
    if (!reach) return [];
    const packages = reach.filter((grant) => grant.package !== undefined);
    const byPackage = Map.groupBy(module.externals, (external) => external.package);
    return [...byPackage].flatMap(([name, edges]) => {
      const outside = edges.filter((edge) => !packages.some((grant) => listsPackage(grant.package!, edge)));
      if (outside.length === 0) return [];
      const finding = refused(model, module.file, name, outside, packages);
      return [docs ? { ...finding, docs } : finding];
    });
  });

const refused = (
  model: Model,
  from: string,
  name: string,
  edges: ExternalImport[],
  packages: readonly Grant[],
): Finding => {
  const unit = model.unitOf(from)!;
  const owner = model.partOf(from) ?? unit.id;
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
      `${from} (${place(model, from, unit)}) ${imports} ${specifiers.join(', ')}, a package outside ${owner}'s reach${lists}. ` +
      `Add pkg('${name}') to a using if the dependency is intended, or move the code.`,
    details: { from: { unit: unit.id, part: model.partOf(from) }, package: name, edges },
  };
};
