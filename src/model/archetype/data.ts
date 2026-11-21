/**
 * The archetype config as plain data, which the builders in builder.ts produce once loadConfigData has checked them.
 * Archetypes refer to each other by name, and references to parts, requirements and packages are records. `match`
 * functions and plugins are the only code left in it.
 */

/** A part of the same archetype, or one surface of a dir part's units. */
export interface PartRefData {
  kind: 'part';
  part: string;
  surface?: string;
}

/** A requirement, answered by the nearest provider above, or one surface of it. */
export interface RequiredRefData {
  kind: 'required';
  name: string;
  surface?: string;
}

/** External packages by name or glob: `node:*`, `@aws-sdk/*`, `*`. */
export interface PackageRefData {
  kind: 'package';
  pattern: string;
}

export type RefData = PartRefData | RequiredRefData | PackageRefData;

/** An inline rule: every file in `from` imports something in `to`. */
export interface MustImportData {
  inline: 'mustImport';
  from: PartRefData | RequiredRefData;
  to: PartRefData | RequiredRefData;
}

/** `'off'` turns every rule off at that level; `'*'` beside other ids does the same and lets those back on. */
export type RuleSettingsData = 'off' | Record<string, boolean | MustImportData | Record<string, unknown>>;

export interface FilesPartData {
  kind: 'files';
  name: string;
  patterns: string[];
  using: RefData[];
  rules?: RuleSettingsData;
  description?: string;
}

export interface DirPartData {
  kind: 'dir';
  name: string;
  paths: string[];
  /** The archetype of each unit the part finds, by name. A part with none finds plain folders. */
  archetype?: string;
  using: RefData[];
  rules?: RuleSettingsData;
  description?: string;
}

export type PartData = FilesPartData | DirPartData;

/** An archetype by name, or a part with no archetype: `dir()` or `files()`. */
export type RequirementData = { kind: 'archetype'; archetype: string } | { kind: 'dir' } | { kind: 'files' };

export type IdentifyData =
  | { marker: string }
  | { match: (dir: string, chain: readonly unknown[]) => false | Record<string, string> };

export type Loose = 'allow' | 'warn' | 'deny';

export interface ArchetypeData {
  name: string;
  description?: string;
  identify?: IdentifyData;
  requires: Record<string, RequirementData>;
  /** In declaration order, which is dependency order. */
  parts: PartData[];
  /** Each surface's references. Absent when the archetype exposes everything. */
  exposes?: Record<string, RefData[]>;
  provides: Record<string, PartRefData>;
  loose?: Loose;
  rules?: RuleSettingsData;
}

export interface ConfigData {
  /** The root archetype's name. */
  root: string;
  /** Every archetype the root reaches, by name. */
  archetypes: Record<string, ArchetypeData>;
  tsconfig: string[];
  rules?: RuleSettingsData;
  plugins: Record<string, unknown>;
}
