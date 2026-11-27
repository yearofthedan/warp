import { SyntaxKind } from 'typescript/ast';
import type {
  ExportDeclaration,
  Identifier,
  ImportDeclaration,
  ImportEqualsDeclaration,
  Node,
  SourceFile,
  Statement,
  StringLiteralLikeNode,
} from 'typescript/ast';
import {
  isExportAssignment,
  isExportDeclaration,
  isIdentifier,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isNamedExports,
  isNamedImports,
  isNamespaceImport,
  isStringLiteralLikeNode,
} from 'typescript/ast/is';
import { type Checker, type Program, SymbolFlags } from 'typescript/sync';
import { isBuiltin } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { ExternalImport, ImportEdge, UnresolvedImport } from '../../domain/facts/facts.ts';
import type { Source } from './source.ts';
import { inlineReferences, statementSpecifier } from './specifiers.ts';

export interface Resolver {
  checker: Checker;
  program: Program;
  relative: (pathOrFileName: string) => string | undefined;
  exists: (fileName: string) => boolean;
  requireTarget: (specifier: string, directory: string) => string | undefined;
}

interface Binding {
  identifier: Identifier;
  typeOnly: boolean;
  reExport: boolean;
}

export interface FileEdges {
  imports: ImportEdge[];
  externals: ExternalImport[];
  unresolved: UnresolvedImport[];
}

export const fileEdges = (source: Source, resolver: Resolver): FileEdges => {
  const edges: FileEdges = { imports: [], externals: [], unresolved: [] };
  for (const reference of moduleReferences(source.sourceFile)) {
    const { specifier } = reference;
    const resolvedFileName = resolvedTarget(reference, source, resolver);
    const via = resolvedFileName ? resolver.relative(resolvedFileName) : undefined;
    if (via) edges.imports.push(...referenceEdges(reference, via, source, resolver));
    else if (isBare(specifier.text)) edges.externals.push(externalImport(reference, source));
    else if (!resolvedFileName && !namesFileOnDisk(specifier.text, source, resolver))
      edges.unresolved.push({ from: source.file, specifier: specifier.text, line: source.line(reference.node) });
  }
  return edges;
};

const resolvedTarget = (reference: ModuleReference, source: Source, resolver: Resolver): string | undefined => {
  const { fileName } = source.sourceFile;
  const resolved = resolver.program.getResolvedModuleFromModuleSpecifier(
    reference.specifier,
    fileName,
  )?.resolvedFileName;
  return (
    resolved ?? (reference.require ? resolver.requireTarget(reference.specifier.text, dirname(fileName)) : undefined)
  );
};

const namesFileOnDisk = (specifier: string, source: Source, resolver: Resolver): boolean =>
  resolver.exists(resolve(dirname(source.sourceFile.fileName), specifier));

const isBare = (specifier: string): boolean => !specifier.startsWith('.') && !specifier.startsWith('/');

const packageOf = (specifier: string): string => {
  const segments = specifier.split('/');
  if (specifier.startsWith('@')) return segments.slice(0, 2).join('/');
  const [name] = segments as [string];
  return !name.includes(':') && isBuiltin(name) ? `node:${name}` : name;
};

const externalImport = (declaration: ModuleReference, source: Source): ExternalImport => {
  const reExport = declaration.reExport || declaration.bindings.some((binding) => binding.reExport);
  return {
    from: source.file,
    package: packageOf(declaration.specifier.text),
    specifier: declaration.specifier.text,
    names: declaration.bindings.map((binding) => binding.identifier.text),
    typeOnly:
      declaration.typeOnly ||
      (declaration.bindings.length > 0 && declaration.bindings.every((binding) => binding.typeOnly)),
    ...(reExport ? { reExport } : {}),
    line: source.line(declaration.node),
  };
};

const referenceEdges = (
  declaration: ModuleReference,
  via: string,
  source: Source,
  resolver: Resolver,
): ImportEdge[] => {
  const edge = (to: string, names: string[], typeOnly: boolean, reExport: boolean): ImportEdge => ({
    from: source.file,
    to,
    ...(to === via ? {} : { via }),
    specifier: declaration.specifier.text,
    names,
    typeOnly,
    ...(reExport ? { reExport } : {}),
    line: source.line(declaration.node),
  });
  if (declaration.bindings.length === 0) return [edge(via, [], declaration.typeOnly, declaration.reExport)];

  const byTarget = new Map<string, { to: string; names: string[]; typeOnly: boolean; reExport: boolean }>();
  for (const binding of declaration.bindings) {
    const target = resolveBinding(binding, source, resolver) ?? { file: via, typeOnly: false };
    const key = `${target.file}\0${binding.reExport}`;
    const entry = byTarget.get(key) ?? { to: target.file, names: [], typeOnly: true, reExport: binding.reExport };
    entry.names.push(binding.identifier.text);
    entry.typeOnly &&= declaration.typeOnly || binding.typeOnly || target.typeOnly;
    byTarget.set(key, entry);
  }
  return [...byTarget.values()].map(({ to, names, typeOnly, reExport }) => edge(to, names, typeOnly, reExport));
};

interface ModuleStatement {
  specifier: StringLiteralLikeNode;
  typeOnly: boolean;
  reExport: boolean;
  bindings: Binding[];
}

interface ModuleReference extends ModuleStatement {
  node: Node;
  require: boolean;
}

const moduleReferences = (sourceFile: SourceFile): ModuleReference[] => {
  const exported = locallyExportedNames(sourceFile);
  const statements = sourceFile.statements.flatMap((statement) => {
    const declaration = moduleDeclaration(statement, exported);
    return declaration ? [{ ...declaration, node: statement, require: false }] : [];
  });
  const inline = inlineReferences(sourceFile).map(({ node, specifier, typeOnly, require }) => ({
    node,
    specifier,
    typeOnly,
    require,
    reExport: false,
    bindings: [],
  }));
  return [...statements, ...inline];
};

const moduleDeclaration = (statement: Statement, exported: Set<string>): ModuleStatement | undefined =>
  isImportDeclaration(statement)
    ? importStatement(statement, exported)
    : isExportDeclaration(statement)
      ? reExportStatement(statement)
      : isImportEqualsDeclaration(statement)
        ? importEqualsStatement(statement, exported)
        : undefined;

const locallyExportedNames = (sourceFile: SourceFile): Set<string> => {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        const local = element.propertyName ?? element.name;
        if (isIdentifier(local)) names.add(local.text);
      }
    } else if (isExportAssignment(statement) && isIdentifier(statement.expression)) {
      names.add(statement.expression.text);
    }
  }
  return names;
};

const importStatement = (statement: ImportDeclaration, exported: Set<string>): ModuleStatement | undefined => {
  if (!isStringLiteralLikeNode(statement.moduleSpecifier)) return undefined;
  const clause = statement.importClause;
  const named = clause?.namedBindings;
  const binding = (identifier: Identifier, typeOnly: boolean): Binding => ({
    identifier,
    typeOnly,
    reExport: exported.has(identifier.text),
  });
  const bindings: Binding[] = [
    ...(clause?.name ? [binding(clause.name, false)] : []),
    ...(named && isNamespaceImport(named) ? [binding(named.name, false)] : []),
    ...(named && isNamedImports(named)
      ? named.elements.map((element) => binding(element.name, element.isTypeOnly))
      : []),
  ];
  return {
    specifier: statement.moduleSpecifier,
    typeOnly: clause?.phaseModifier === SyntaxKind.TypeKeyword,
    reExport: false,
    bindings,
  };
};

const importEqualsStatement = (
  statement: ImportEqualsDeclaration,
  exported: Set<string>,
): ModuleStatement | undefined => {
  const specifier = statementSpecifier(statement);
  if (!specifier || !isIdentifier(statement.name)) return undefined;
  const reExport =
    exported.has(statement.name.text) ||
    (statement.modifiers?.some((modifier) => modifier.kind === SyntaxKind.ExportKeyword) ?? false);
  return {
    specifier,
    typeOnly: statement.isTypeOnly,
    reExport: false,
    bindings: [{ identifier: statement.name, typeOnly: false, reExport }],
  };
};

const reExportStatement = (statement: ExportDeclaration): ModuleStatement | undefined => {
  if (!statement.moduleSpecifier || !isStringLiteralLikeNode(statement.moduleSpecifier)) return undefined;
  const clause = statement.exportClause;
  const elements = clause && isNamedExports(clause) ? clause.elements : [];
  const bindings = elements.flatMap((element) =>
    isIdentifier(element.name) ? [{ identifier: element.name, typeOnly: element.isTypeOnly, reExport: true }] : [],
  );
  return { specifier: statement.moduleSpecifier, typeOnly: statement.isTypeOnly, reExport: true, bindings };
};

const resolveBinding = (
  binding: Binding,
  source: Source,
  resolver: Resolver,
): { file: string; typeOnly: boolean } | undefined => {
  const symbol = source.symbolOf(binding.identifier);
  if (!symbol || !(symbol.flags & SymbolFlags.Alias)) return undefined;
  const target = resolver.checker.getAliasedSymbol(symbol);
  if (resolver.checker.isUnknownSymbol(target)) return undefined;
  const file = target.declarations
    .map((declaration) => resolver.relative(declaration.path))
    .find((path) => path !== undefined);
  if (!file) return undefined;
  return { file, typeOnly: (target.flags & SymbolFlags.Value) === 0 };
};
