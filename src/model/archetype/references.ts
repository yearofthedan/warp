/**
 * The second pass of loading: checks every reference against the parts, requirements and surfaces it names, and
 * turns references and rule settings into data.
 */
import { ConfigError } from '../rule.ts';
import { recordedAs } from './builder.ts';
import type { ArchetypeData, MustImportData, PartRefData, RefData, RuleSettingsData } from './data.ts';
import type { Draft } from './draft.ts';
import { type Fail, isName, isRecord, list, shapeText } from './shared.ts';

/** What the reference checks need from the whole config. */
export interface Check {
  fail: Fail;
  /** Rule ids the config may configure, when the caller knows them. */
  ruleIds?: ReadonlySet<string>;
  /** Option checks by rule id. */
  options: Readonly<Record<string, (raw: Record<string, unknown>, at: string) => unknown>>;
  /** The surfaces an archetype exposes; undefined when it has no `.exposes()`. */
  surfacesOf: (archetype: string) => string[] | undefined;
}

type RefKind = RefData['kind'];

/** What a reference may name where it appears. */
interface Scope {
  archetype: ArchetypeData;
  /** How many of the archetype's parts it sees: those above a part, or all of them. */
  visible: number;
  kinds: readonly RefKind[];
  /** Why the other kinds are refused here. */
  refused: string;
  /** The part whose options hold the reference, which sees the parts above it. */
  part?: string;
  /** Only a part as a whole, no surface. */
  whole?: boolean;
}

const packagesInUsing = 'pkg() belongs in using';
const ruleKinds: readonly RefKind[] = ['part', 'required'];

/** A reference as load errors name it: `part.surface`, `required.name`, `pkg('name')`. */
export const show = (ref: RefData): string =>
  ref.kind === 'package'
    ? `pkg('${ref.pattern}')`
    : `${ref.kind === 'required' ? `required.${ref.name}` : ref.part}${ref.surface === undefined ? '' : `.${ref.surface}`}`;

/** Fills a draft's data with its checked references and rule settings. */
export const resolveDraft = (check: Check, { data: archetype, parts, exposes, provides, rules }: Draft) => {
  for (const [index, part] of parts.entries()) {
    const scope: Scope = {
      archetype,
      visible: index,
      kinds: ['part', 'required', 'package'],
      refused: packagesInUsing,
      part: part.data.name,
    };
    const where = `${archetype.name}.${part.data.name}`;
    part.data.using.push(...part.using.map((value) => toRef(check, value, `${where} uses`, scope)));
    part.data.rules = toRules(check, part.rules, `${where}.rules`, scope);
  }
  const visible = archetype.parts.length;
  const own: Scope = {
    archetype,
    visible,
    kinds: ['part'],
    refused: 'exposes and provides name the archetype’s own parts',
  };
  archetype.exposes =
    exposes &&
    Object.fromEntries(
      Object.entries(exposes).map(([surface, refs]) => [
        surface,
        refs.map((value) => toRef(check, value, `${archetype.name} exposes ${surface} as`, own)),
      ]),
    );
  for (const [name, value] of Object.entries(provides)) {
    const scope = { ...own, whole: true };
    archetype.provides[name] = toRef(check, value, `${archetype.name} provides ${name} as`, scope) as PartRefData;
  }
  const scope: Scope = { archetype, visible, kinds: ruleKinds, refused: packagesInUsing };
  archetype.rules = toRules(check, rules, `${archetype.name}.rules`, scope);
};

/** A reference as data. One that fails its check is reported, and loading throws before its data is used. */
const toRef = (check: Check, value: unknown, where: string, scope: Scope): RefData => {
  const ref = recordedAs(value, 'ref');
  if (!ref) check.fail(`${where} something other than a reference: use s.part, required.name or pkg('name')`);
  else {
    const problem = refProblem(check, ref, scope);
    if (problem) check.fail(`${where} ${show(ref)}; ${problem}`);
  }
  return { ...ref } as RefData;
};

/** Rule settings as data; inline rules need a scope, so the global settings pass none. */
export const toRules = (
  check: Check,
  value: unknown,
  where: string,
  scope: Scope | undefined,
): RuleSettingsData | undefined => {
  if (value === undefined || value === 'off') return value;
  if (!isRecord(value)) {
    check.fail(`${where}: expected 'off' or rule settings by id`);
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value).map(([id, setting]) => [id, toSetting(check, id, setting, where, scope)]),
  ) as RuleSettingsData;
};

const toSetting = (check: Check, id: string, setting: unknown, where: string, scope: Scope | undefined) => {
  const inline = recordedAs(setting, 'inline');
  if (inline) return toInline(check, id, inline, where, scope);
  if (id !== '*' && check.ruleIds && !check.ruleIds.has(id)) check.fail(`${where}: no rule called ${id}`);
  else if (typeof setting === 'boolean') return setting;
  else if (id !== '*' && isRecord(setting) && !recordedAs(setting, 'ref'))
    return checkOptions(check, id, setting, where);
  else check.fail(`${where}.${id}: expected true, false${id === '*' ? '' : ', options or an inline rule'}`);
  return undefined;
};

const checkOptions = (check: Check, id: string, options: Record<string, unknown>, where: string) => {
  try {
    check.options[id]?.(options, `${where}.${id}`);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    check.fail(error.message);
  }
  return { ...options };
};

const toInline = (
  check: Check,
  id: string,
  inline: { from: unknown; to: unknown },
  where: string,
  scope: Scope | undefined,
): MustImportData | undefined => {
  if (!scope) check.fail(`${where}.${id}: an inline rule belongs to an archetype or a part`);
  else if (check.ruleIds?.has(id))
    check.fail(`${where}.${id}: ${id} is a built-in rule; give the inline rule its own name`);
  else {
    const refs = { ...scope, kinds: ruleKinds };
    const from = toRef(check, inline.from, `${where}.${id} takes from`, refs) as MustImportData['from'];
    const to = toRef(check, inline.to, `${where}.${id} takes to`, refs) as MustImportData['to'];
    return { inline: 'mustImport', from, to };
  }
  return undefined;
};

/** Why a reference is wrong where it appears, or undefined if it is right. */
const refProblem = (check: Check, ref: RefData, scope: Scope): string | undefined => {
  if (!scope.kinds.includes(ref.kind)) return scope.refused;
  if (ref.kind === 'package') return isName(ref.pattern) ? undefined : 'a package pattern is a non-empty string';
  if (ref.kind === 'required') return requiredProblem(check, ref.name, ref.surface, scope.archetype);
  return partProblem(check, ref.part, ref.surface, scope);
};

const requiredProblem = (check: Check, name: string, surface: string | undefined, archetype: ArchetypeData) => {
  const requirement = archetype.requires[name];
  if (!requirement) return `${archetype.name} requires ${list(Object.keys(archetype.requires), 'nothing')}`;
  if (surface === undefined) return undefined;
  if (requirement.kind !== 'archetype')
    return `required.${name} is ${shapeText(requirement.kind)}, which has no surfaces`;
  return surfaceProblem(requirement.archetype, surface, check.surfacesOf(requirement.archetype));
};

const partProblem = (check: Check, name: string, surface: string | undefined, scope: Scope) => {
  const index = scope.archetype.parts.findIndex((part) => part.name === name);
  if (index < 0 || index >= scope.visible) return visibilityProblem(name, index, scope);
  if (surface === undefined) return undefined;
  if (scope.whole) return 'name the whole part, without a surface';
  const part = scope.archetype.parts[index]!;
  if (part.kind === 'files') return `${part.name} is a files part, which has no surfaces`;
  if (part.archetype === undefined) return `${part.name} is a plain folder, which has no surfaces`;
  return surfaceProblem(part.archetype, surface, check.surfacesOf(part.archetype));
};

/** For a part that isn't among those the reference sees: what it does see. */
const visibilityProblem = (name: string, index: number, { archetype, visible, part }: Scope): string => {
  const above = list(
    archetype.parts.slice(0, visible).map((candidate) => candidate.name),
    'no parts',
  );
  if (part === undefined) return `${archetype.name} has parts ${above}`;
  if (index < 0) return `${part} sees ${above}`;
  if (index === visible) return `a part reaches its own files already; ${part} sees ${above}`;
  return `${name} is declared below ${part}, which sees ${above}`;
};

const surfaceProblem = (archetype: string, surface: string, surfaces: string[] | undefined): string | undefined => {
  if (surfaces === undefined) return `${archetype} has no .exposes(), so it names no surfaces`;
  return surfaces.includes(surface) ? undefined : `${archetype} exposes ${list(surfaces, 'nothing')}`;
};
