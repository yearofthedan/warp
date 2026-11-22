import type { ConfigData } from '../../archetype/data.ts';
import { place } from '../../archetype/place.ts';
import type { Refusal, Verdicts } from '../../archetype/reach.ts';
import type { Model } from '../../archetype/resolve.ts';
import type { ImportEdge } from '../../facts.ts';
import { type Finding, noOptions, type ProjectRule } from '../../rule.ts';

const id = 'dependency-direction';

export const dependencyDirection: ProjectRule = {
  id,
  scope: 'project',
  parseOptions: noOptions,
  check: ({ config, model, verdicts, project, atFile }) =>
    project.modules.flatMap((module) => {
      if (!atFile(module.file).on) return [];
      const byTarget = Map.groupBy(module.imports, (edge) => edge.via ?? edge.to);
      return [...byTarget].flatMap(([to, edges]) => {
        const verdict = verdicts.verdict(module.file, to);
        if (verdict === undefined || verdict.allowed) return [];
        return [refused({ config, model, verdicts }, module.file, to, verdict, edges)];
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
  const source = model.unitOf(from)!;
  const target = model.unitOf(to)!;
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
      from: { unit: source.id, part: model.partOf(from) },
      to: { unit: target.id, part: model.partOf(to) },
      reason: refusal.reason,
      ...(refusal.reason === 'private' ? { hiddenBy: refusal.hiddenBy.id } : {}),
      edges,
    },
  };
};

const explain = ({ config, model, verdicts }: Context, from: string, to: string, refusal: Refusal): string => {
  const source = model.unitOf(from)!;
  if (refusal.reason === 'private') {
    const { hiddenBy } = refusal;
    const exposes = Object.keys(config.archetypes[hiddenBy.archetype!]!.exposes ?? {});
    return (
      `which ${hiddenBy.id} keeps private (it exposes ${exposes.join(', ')}). ` +
      `Import what ${hiddenBy.id} exposes, or expose ${to} from ${hiddenBy.archetype} if other units should reach it.`
    );
  }
  if (refusal.reason === 'above')
    return (
      `which is above ${source.id}. A unit reaches up only through what it requires: ` +
      `require it in ${source.archetype ?? 'the archetype that finds it'} and have an ancestor provide it, or move it below.`
    );
  const owner = model.partOf(from) ?? source.id;
  const uses = Map.groupBy(
    verdicts.reach(from)!.filter((grant) => grant.ref !== undefined),
    (grant) => grant.owner,
  );
  const reaches =
    uses.size > 0
      ? `: ${[...uses].map(([by, grants]) => `${by} uses ${grants.map((grant) => grant.ref).join(', ')}`).join('; ')}`
      : ', its own files only';
  return (
    `which is outside ${owner}'s reach${reaches}. ` +
    `Add what holds ${to} to a using if the dependency is intended, or move the code.`
  );
};
