import { listsPackage } from '../packages.ts';
import { place } from '../place.ts';
import type { ConfigData } from '../../domain/model/data.ts';
import { sitesOf } from '../../domain/fixes/fixes.ts';
import { packageText } from '../../domain/model/text.ts';
import type { Grant } from '../../domain/model/reach.ts';
import type { Model } from '../../domain/model/resolve.ts';
import type { ExternalImport } from '../../domain/facts/facts.ts';
import { type Finding, noOptions, type ProjectRule } from '../../domain/rules/rule.ts';

const id = 'module-externals';

export const moduleExternals: ProjectRule = {
  id,
  scope: 'project',
  parseOptions: noOptions,
  check: ({ config, model, verdicts, project, atFile }) =>
    project.files.flatMap((file) => {
      const reach = verdicts.reach(file.path);
      if (!reach || !atFile(file.path).on) return [];
      const packages = reach.filter((grant) => grant.package !== undefined);
      const byPackage = Map.groupBy(file.externals, (external) => external.package);
      return [...byPackage].flatMap(([name, edges]) => {
        const outside = edges.filter((edge) => !packages.some((grant) => listsPackage(grant.package!, edge)));
        return outside.length === 0 ? [] : [refused(config, model, file.path, name, outside, packages)];
      });
    }),
};

const refused = (
  config: ConfigData,
  model: Model,
  from: string,
  name: string,
  edges: ExternalImport[],
  packages: readonly Grant[],
): Finding => {
  const module = model.moduleOf(from)!;
  const owner = module.name ?? module.id;
  const names = [...new Set(edges.flatMap((edge) => edge.names))];
  const specifiers = [...new Set(edges.map((edge) => edge.specifier))];
  const imports = edges.every((edge) => edge.typeOnly) ? 'imports types from' : 'imports';
  const site = sitesOf(config, model, from)[0];
  const where = site?.label ?? 'its dependencies';
  const listed = new Set(packages.map((grant) => grant.ref)).size;
  const more = listed > 0 ? ` (+${listed} more in reach)` : '';
  return {
    rule: id,
    key: `${id}:${from}->${name}`,
    file: from,
    line: edges[0]!.line,
    value: Math.max(1, names.length),
    message:
      `${from} (${place(model, from, module)}) ${imports} ${specifiers.join(', ')}, a package outside ${owner}'s reach. ` +
      `Add ${packageText(name)} to ${where}, or move the code.${more}`,
    details: { from: module.id, package: name, edges },
  };
};
