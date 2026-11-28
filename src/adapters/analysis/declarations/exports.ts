import type { ExportDeclaration, Node, Statement } from 'typescript/ast';
import { SyntaxKind } from 'typescript/ast';
import {
  isClassDeclaration,
  isEnumDeclaration,
  isExportAssignment,
  isExportDeclaration,
  isFunctionDeclaration,
  isIdentifier,
  isInterfaceDeclaration,
  isModuleDeclaration,
  isNamedExports,
  isTypeAliasDeclaration,
  isVariableStatement,
} from 'typescript/ast/is';
import { SymbolFlags } from 'typescript/sync';
import type { Export } from '../../../domain/facts/facts.ts';
import type { Resolver, Source } from '../source/source.ts';

export const fileExports = (source: Source, resolver: Resolver): Export[] => {
  const { checker } = resolver;
  const module = checker.getSymbolOfSourceFile(source.sourceFile.fileName);
  if (!module) return [];
  const lines = exportLines(source);
  const exported = [...module.getExports().values()].filter((symbol) => symbol.name !== '__export');
  return exported.flatMap((symbol): Export[] => {
    const target = symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    if (checker.isUnknownSymbol(target)) return [];
    const file = target.declarations.map((declaration) => resolver.relative(declaration.path)).find(Boolean);
    if (!file) return [];
    const isFile = target.declarations.some((declaration) => declaration.kind === SyntaxKind.SourceFile);
    return [
      {
        name: symbol.name,
        line: lines.get(symbol.name) ?? 1,
        declared: { file, name: isFile ? '*' : target.name },
      },
    ];
  });
};

const exportLines = (source: Source): Map<string, number> => {
  const lines = new Map<string, number>();
  for (const statement of source.sourceFile.statements)
    for (const name of exportedNames(statement)) if (!lines.has(name)) lines.set(name, source.line(statement));
  return lines;
};

const exportedNames = (statement: Statement): string[] => {
  if (isExportDeclaration(statement)) return clauseNames(statement);
  if (isExportAssignment(statement)) return ['default'];
  if (!hasModifier(statement, SyntaxKind.ExportKeyword)) return [];
  return hasModifier(statement, SyntaxKind.DefaultKeyword) ? ['default'] : declaredNames(statement);
};

const textOf = (node: Node | undefined): string[] => (node && isIdentifier(node) ? [node.text] : []);

const clauseNames = ({ exportClause: clause }: ExportDeclaration): string[] => {
  if (!clause) return [];
  return isNamedExports(clause) ? clause.elements.flatMap((element) => textOf(element.name)) : textOf(clause.name);
};

const declaredNames = (statement: Statement): string[] => {
  if (isVariableStatement(statement))
    return statement.declarationList.declarations.flatMap((declaration) => textOf(declaration.name));
  const named =
    isFunctionDeclaration(statement) ||
    isClassDeclaration(statement) ||
    isInterfaceDeclaration(statement) ||
    isTypeAliasDeclaration(statement) ||
    isEnumDeclaration(statement) ||
    isModuleDeclaration(statement);
  return named ? textOf(statement.name) : [];
};

const hasModifier = (node: Node, kind: SyntaxKind): boolean =>
  ((node as { modifiers?: readonly Node[] }).modifiers ?? []).some((modifier) => modifier.kind === kind);
