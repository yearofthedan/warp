import type { ConfigData } from '../../model/archetype/data.ts';
import { exposesText } from '../../model/archetype/references.ts';
import { place } from '../place.ts';
import type { Refusal, Verdicts } from '../../model/archetype/reach.ts';
import type { Model } from '../../model/archetype/resolve.ts';
import type { ImportEdge } from '../../model/facts.ts';
import { type Finding, noOptions, type ProjectRule } from '../../rules/rule.ts';

const id = 'dependency-direction';

export const dependencyDirection: ProjectRule = {
  id,
  scope: 'project',
  parseOptions: noOptions,
  check: ({ config, model, verdicts, project, atFile }) =>
    project.files.flatMap((file) => {
      if (!atFile(file.path).on) return [];
      const byTarget = Map.groupBy(file.imports, (edge) => edge.via ?? edge.to);
      return [...byTarget].flatMap(([to, edges]) => {
        const verdict = verdicts.verdict(file.path, to);
        if (verdict === undefined || verdict.allowed) return [];
        return [refused({ config, model, verdicts }, file.path, to, verdict, edges)];
      });
    }),
};

interface Context {
  config: ConfigData;
  model: Model;
  verdicts: Verdicts;
}

const refused = (context: Context, from: string, to: string, refusal: Refusal, edges: ImportEdge[]): Finding => {
  const { model } = context;
  const source = model.moduleOf(from)!;
  const target = model.moduleOf(to)!;
  const names = [...new Set(edges.flatMap((edge) => edge.names))];
  const imports = edges.every((edge) => edge.typeOnly) ? 'imports types from' : 'imports';
  return {
    rule: id,
    key: `${id}:${from}->${to}`,
    file: from,
    line: edges[0]!.line,
    value: Math.max(1, names.length),
    message: `${from} (${place(model, from, source)}) ${imports} ${to} (${place(model, to, target)}), ${explain(context, from, to, refusal)}`,
    details: {
      from: source.id,
      to: target.id,
      reason: isLoose(model, to) ? 'loose' : refusal.reason,
      ...(refusal.reason === 'private' ? { hiddenBy: refusal.hiddenBy.id } : {}),
      edges,
    },
  };
};

const explain = ({ config, model, verdicts }: Context, from: string, to: string, refusal: Refusal): string => {
  const source = model.moduleOf(from)!;
  if (isLoose(model, to))
    return `which is in no module yet. Add a module that holds ${to}, then add it to a using if the dependency is intended.`;
  if (refusal.reason === 'test')
    return 'a test file. Production code never imports tests: move what both need out of the test file into the module it tests.';
  if (refusal.reason === 'private') {
    const { hiddenBy } = refusal;
    return (
      `which ${hiddenBy.id} keeps private (it exposes ${exposesText(verdicts.exposes(hiddenBy))}). ` +
      `Import what ${hiddenBy.id} exposes, or expose ${to} from ${hiddenBy.archetype ?? hiddenBy.name} if other modules should reach it.`
    );
  }
  if (refusal.reason === 'above') {
    const folder = source.kind === 'dir' ? source : source.parent!;
    if (source.kind === 'test')
      return (
        `which is above ${folder.id}. A test reaches up through testUsing: ` +
        `name what holds ${to} in the testUsing of a module above ${folder.id}, or move it below.`
      );
    return (
      `which is above ${folder.id}. A module reaches up only through what it requires: ` +
      `require it in ${namedArchetype(config, folder.archetype!)} and have an ancestor provide it, or move it below.`
    );
  }
  const owner = source.name ?? source.id;
  const uses = Map.groupBy(
    verdicts.reach(from)!.filter((grant) => grant.ref !== undefined),
    (grant) => grant.owner,
  );
  const reaches =
    uses.size > 0
      ? `: ${[...uses].map(([by, grants]) => `${by} uses ${grants.map((grant) => grant.ref).join(', ')}`).join('; ')}`
      : `: ${owner} may use nothing`;
  return (
    `which is outside ${owner}'s reach${reaches}. ` +
    `Add what holds ${to} to a using if the dependency is intended, or move the code.`
  );
};

const isLoose = (model: Model, file: string): boolean => model.moduleOf(file)!.looseFiles.includes(file);

const namedArchetype = (config: ConfigData, name: string): string =>
  config.archetypes[name]!.inline ? namedArchetype(config, name.slice(0, name.lastIndexOf('.'))) : name;
