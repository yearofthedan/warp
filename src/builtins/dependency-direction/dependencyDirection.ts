import type { ConfigData } from '../../model/archetype/data.ts';
import { exposesText } from '../../model/archetype/references.ts';
import { fixSteps, reachSize, sentence } from '../advice.ts';
import { place } from '../place.ts';
import { title } from '../shared.ts';
import { fixesFor } from '../../model/archetype/fixes.ts';
import type { Refusal, Verdicts } from '../../model/archetype/reach.ts';
import type { Model, ModuleView } from '../../model/archetype/resolve.ts';
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
  if (isLoose(model, to))
    return `which is in no module yet. Add a module that holds ${to}, then add it to the importer's dependencies if the dependency is intended.`;
  if (refusal.reason === 'test')
    return 'a test file. Production code never imports tests: move what both need out of the test file into the module it tests.';
  const instead =
    refusal.reason === 'private' ? throughSurface({ config, model, verdicts }, from, to, refusal.hiddenBy) : '';
  return `${why(config, model, verdicts, from, to, refusal)}. ${instead || advise(config, model, verdicts, from, to)}`;
};

const why = (config: ConfigData, model: Model, verdicts: Verdicts, from: string, to: string, refusal: Refusal) => {
  const source = model.moduleOf(from)!;
  if (refusal.reason === 'private') {
    const { hiddenBy } = refusal;
    return `which ${hiddenBy.id} keeps private (it exposes ${exposesText(verdicts.exposes(hiddenBy))})`;
  }
  if (refusal.reason === 'above') return `which is above ${(source.kind === 'dir' ? source : source.parent!).id}`;
  return `which is outside ${source.name ?? source.id}'s reach`;
};

const throughSurface = ({ config, model, verdicts }: Context, from: string, to: string, hiddenBy: ModuleView) => {
  if (model.isTest(to)) return '';
  for (const file of verdicts.surface(hiddenBy)) {
    const fixes = fixesFor(config, model, from, file);
    if (!fixes) continue;
    const once = fixes.length > 0 ? `, once you ${sentence(fixSteps(model, fixes))}` : '';
    return `Import what ${hiddenBy.id} exposes instead${once}.`;
  }
  return '';
};

const advise = (config: ConfigData, model: Model, verdicts: Verdicts, from: string, to: string): string => {
  const fixes = fixesFor(config, model, from, to);
  if (!fixes) return 'No declared path allows this: either the import or the structure is wrong.';
  const steps = fixSteps(model, fixes);
  const size = reachSize(verdicts, from);
  const more = size > 0 && fixes.some((fix) => fix.kind === 'using') ? ` (+${size} more in reach)` : '';
  return `${title(sentence(steps))}, or move the code.${more}`;
};

const isLoose = (model: Model, file: string): boolean => model.moduleOf(file)!.looseFiles.includes(file);
