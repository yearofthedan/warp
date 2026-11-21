/**
 * `dependency-direction` on an archetype config: one finding per pair of files where the importer's reach doesn't
 * hold the file it imports (docs/design/archetypes.md, Rules that judge the model).
 */
import type { ImportEdge, Project } from '../facts.ts';
import type { Finding } from '../rule.ts';
import type { ConfigData } from './data.ts';
import type { Refusal, Verdicts } from './reach.ts';
import type { Model, UnitView } from './resolve.ts';

const id = 'dependency-direction';

export const directionFindings = (
  config: ConfigData,
  model: Model,
  verdicts: Verdicts,
  project: Project,
  docs?: string,
): Finding[] =>
  project.modules.flatMap((module) => {
    // An import is judged on the file its specifier names, so a barrel on a surface lets importers through it.
    const byTarget = Map.groupBy(module.imports, (edge) => edge.via ?? edge.to);
    return [...byTarget].flatMap(([to, edges]) => {
      const verdict = verdicts.verdict(module.file, to);
      if (verdict === undefined || verdict.allowed) return [];
      const finding = refused({ config, model, verdicts }, module.file, to, verdict, edges);
      return [docs ? { ...finding, docs } : finding];
    });
  });

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

/** `dom of component src/ui/card`, or `plain folder src/ui/strings`. */
export const place = (model: Model, file: string, unit: UnitView = model.unitOf(file)!): string => {
  if (unit.archetype === undefined) return `plain folder ${unit.id}`;
  const part = model.partOf(file);
  return `${part === undefined ? 'loose in' : `${part} of`} ${unit.archetype} ${unit.id}`;
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
