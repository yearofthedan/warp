export interface Project {
  modules: ModuleFacts[];
}

export interface ModuleFacts {
  file: string;
  lines: number;
  imports: ImportEdge[];
  externals: ExternalImport[];
  units: UnitGraph;
  functions: FunctionFacts[];
}

export interface ImportEdge {
  from: string;
  to: string;
  via?: string;
  specifier: string;
  names: string[];
  typeOnly: boolean;
  reExport?: true;
  line: number;
}

export interface ExternalImport {
  from: string;
  package: string;
  specifier: string;
  names: string[];
  typeOnly: boolean;
  reExport?: true;
  line: number;
}

export type UnitKind = 'function' | 'class' | 'state' | 'type' | 'code';

export interface Unit {
  name: string;
  kind: UnitKind;
  line: number;
  endLine: number;
}

export interface UnitGraph {
  units: Unit[];
  links: [number, number][];
}

export interface FunctionFacts {
  name: string;
  line: number;
  endLine: number;
  lines: number;
  statements: UnitGraph;
  complexity?: Complexity;
}

export interface Complexity {
  total: number;
  increments: { line: number; amount: number; reason: string }[];
}
