export interface Project {
  files: FileFacts[];
}

export interface FileFacts {
  path: string;
  lines: number;
  imports: ImportEdge[];
  externals: ExternalImport[];
  members: MemberGraph;
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

export type MemberKind = 'function' | 'class' | 'state' | 'type' | 'code';

export interface Member {
  name: string;
  kind: MemberKind;
  line: number;
  endLine: number;
}

export interface MemberGraph {
  members: Member[];
  links: [number, number][];
}

export interface FunctionFacts {
  name: string;
  line: number;
  endLine: number;
  lines: number;
  statements: MemberGraph;
  complexity?: Complexity;
}

export interface Complexity {
  total: number;
  increments: { line: number; amount: number; reason: string }[];
}
