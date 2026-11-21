/**
 * Inline rules: `mustImport({ from, to })` reports each file in `from` with no edge to anything in `to`, read in each
 * unit of the archetype that declares it (docs/design/archetypes.md, Inline rules).
 */
import type { ModuleFacts, Project } from '../facts.ts';
import type { Finding } from '../rule.ts';
import type { ArchetypeData, ConfigData, MustImportData, RuleSettingsData } from './data.ts';
import { place } from './direction.ts';
import type { Verdicts } from './reach.ts';
import type { Model, UnitView } from './resolve.ts';

interface Declared {
  name: string;
  rule: MustImportData;
  /** Where the config declares it: the archetype, or `archetype.part` for a part's rules. */
  owner: string;
}

const inlineRules = (settings: RuleSettingsData | undefined, owner: string): Declared[] =>
  typeof settings === 'object'
    ? Object.entries(settings).flatMap(([name, rule]) =>
        typeof rule === 'object' && 'inline' in rule ? [{ name, rule: rule as MustImportData, owner }] : [],
      )
    : [];

const declaredIn = (archetype: ArchetypeData): Declared[] => [
  ...inlineRules(archetype.rules, archetype.name),
  ...archetype.parts.flatMap((part) => inlineRules(part.rules, `${archetype.name}.${part.name}`)),
];

export const inlineFindings = (config: ConfigData, model: Model, verdicts: Verdicts, project: Project): Finding[] => {
  const modules = new Map(project.modules.map((module) => [module.file, module]));
  const findings = new Map<string, Finding>();
  for (const unit of model.units) {
    // A plain folder has no archetype, and so declares nothing.
    const archetype: ArchetypeData | undefined = config.archetypes[unit.archetype as string];
    for (const declared of archetype ? declaredIn(archetype) : []) {
      for (const finding of unitFindings({ model, verdicts, modules }, unit, declared))
        if (!findings.has(finding.key)) findings.set(finding.key, finding);
    }
  }
  return [...findings.values()];
};

interface Context {
  model: Model;
  verdicts: Verdicts;
  modules: ReadonlyMap<string, ModuleFacts>;
}

const unitFindings = ({ model, verdicts, modules }: Context, unit: UnitView, declared: Declared): Finding[] => {
  const { name, rule, owner } = declared;
  const targets = verdicts.files(unit, rule.to);
  const from = verdicts.describe(unit, rule.from);
  const to = verdicts.describe(unit, rule.to);
  return [...verdicts.files(unit, rule.from)].flatMap((file): Finding[] => {
    const module = modules.get(file);
    if (!module || module.imports.some((edge) => targets.has(edge.to) || targets.has(edge.via!))) return [];
    return [
      {
        rule: name,
        key: `${name}:${file}`,
        file,
        line: 1,
        value: 1,
        message:
          `${file} (${place(model, file)}) imports nothing from ${to}, which ${owner}'s ${name} asks of every file ` +
          `in ${from}. Import what it needs from ${to}, or move the file out of ${from}.`,
        details: { unit: unit.id, from, to, declaredBy: owner },
      },
    ];
  });
};
