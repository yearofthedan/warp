export interface ModuleRefData {
  kind: 'module';
  module: string;
  surface?: string;
  up?: number;
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

export interface FilesModuleData {
  kind: 'files';
  name: string;
  patterns: string[];
  using: RefData[];
  exposes?: Exclude<ExposesData, { kind: 'surfaces' }>;
  rules?: RuleSettingsData;
  description?: string;
}

export interface DirModuleData {
  kind: 'dir';
  name: string;
  paths: string[];
  archetype: string;
  test?: true;
  using: RefData[];
  inputs?: Record<string, RefData>;
  testInputs?: Record<string, RefData>;
  rules?: RuleSettingsData;
  description?: string;
}

export interface TestModuleData {
  kind: 'test';
  name: string;
  patterns: string[];
  of?: string;
  using: RefData[];
  exposes?: Exclude<ExposesData, { kind: 'surfaces' }>;
  rules?: RuleSettingsData;
  description?: string;
}

export type ModuleData = FilesModuleData | DirModuleData | TestModuleData;

export const isTestData = (module: ModuleData): boolean =>
  module.kind === 'test' || (module.kind === 'dir' && module.test === true);

export interface IdentifyData {
  marker: string;
}

export interface ArchetypeData {
  name: string;
  inline?: true;
  test?: true;
  description?: string;
  identify?: IdentifyData;
  requires: string[];
  testRequires?: string[];
  modules: ModuleData[];
  exposes?: ExposesData;
  testExposes?: Record<string, RefData[]>;
  testUsing?: RefData[];
  rules?: RuleSettingsData;
}

export interface ConfigData {
  file: string;
  root: string;
  archetypes: Record<string, ArchetypeData>;
  tsconfig: string[];
  rules?: RuleSettingsData;
}
