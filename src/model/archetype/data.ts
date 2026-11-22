export interface PartRefData {
  kind: 'part';
  part: string;
  surface?: string;
}

export interface RequiredRefData {
  kind: 'required';
  name: string;
  surface?: string;
}

export interface PackageRefData {
  kind: 'package';
  pattern: string;
}

export type RefData = PartRefData | RequiredRefData | PackageRefData;

export type RuleSettingsData = 'off' | Record<string, boolean | Record<string, unknown>>;

export interface FilesPartData {
  kind: 'files';
  name: string;
  patterns: string[];
  using: RefData[];
  mustImport?: (PartRefData | RequiredRefData)[];
  rules?: RuleSettingsData;
  description?: string;
}

export interface DirPartData {
  kind: 'dir';
  name: string;
  paths: string[];
  archetype?: string;
  using: RefData[];
  rules?: RuleSettingsData;
  description?: string;
}

export type PartData = FilesPartData | DirPartData;

export type RequirementData = { kind: 'archetype'; archetype: string } | { kind: 'dir' } | { kind: 'files' };

export type IdentifyData =
  | { marker: string }
  | { match: (dir: string, chain: readonly unknown[]) => false | Record<string, string> };

export interface ArchetypeData {
  name: string;
  description?: string;
  identify?: IdentifyData;
  requires: Record<string, RequirementData>;
  parts: PartData[];
  exposes?: Record<string, RefData[]>;
  provides: Record<string, PartRefData>;
  rules?: RuleSettingsData;
}

export interface ConfigData {
  root: string;
  archetypes: Record<string, ArchetypeData>;
  tsconfig: string[];
  rules?: RuleSettingsData;
}
