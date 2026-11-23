export interface ModuleRefData {
  kind: 'module';
  module: string;
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

export type RefData = ModuleRefData | RequiredRefData | PackageRefData;

export type RuleSettingsData = 'off' | Record<string, boolean | Record<string, unknown>>;

export type ExposesData =
  | { kind: 'all' }
  | { kind: 'files'; patterns: string[]; entry?: true }
  | { kind: 'surfaces'; surfaces: Record<string, RefData[]> };

export interface LocatorData {
  kind: 'dir' | 'files';
  patterns: string[];
}

export interface TestLayerData {
  locator?: LocatorData;
  modules: FilesModuleData[];
  using: RefData[];
  exposes?: ExposesData;
  rules?: RuleSettingsData;
}

export interface FilesModuleData {
  kind: 'files';
  name: string;
  patterns: string[];
  using: RefData[];
  exposes?: Exclude<ExposesData, { kind: 'surfaces' }>;
  tests?: TestLayerData;
  rules?: RuleSettingsData;
  description?: string;
}

export interface DirModuleData {
  kind: 'dir';
  name: string;
  paths: string[];
  archetype: string;
  using: RefData[];
  rules?: RuleSettingsData;
  description?: string;
}

export type ModuleData = FilesModuleData | DirModuleData;

export type RequirementData = { kind: 'archetype'; archetype: string } | { kind: 'dir' } | { kind: 'files' };

export type IdentifyData =
  | { marker: string }
  | { match: (dir: string, chain: readonly unknown[]) => false | Record<string, string> };

export interface ArchetypeData {
  name: string;
  inline?: true;
  description?: string;
  identify?: IdentifyData;
  requires: Record<string, RequirementData>;
  modules: ModuleData[];
  exposes?: ExposesData;
  provides: Record<string, ModuleRefData>;
  tests?: TestLayerData;
  rules?: RuleSettingsData;
}

export interface ConfigData {
  file: string;
  root: string;
  archetypes: Record<string, ArchetypeData>;
  tsconfig: string[];
  tests?: string[];
  rules?: RuleSettingsData;
}
