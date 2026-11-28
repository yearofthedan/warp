import { SyntaxKind } from 'typescript/ast';
import type { Expression, Identifier, Node, PropertyAccessExpression } from 'typescript/ast';
import {
  isCallExpression,
  isHeritageClause,
  isIdentifier,
  isNonNullExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isShorthandPropertyAssignment,
} from 'typescript/ast/is';
import { type Symbol, SymbolFlags } from 'typescript/sync';
import type { Chain, Declared } from '../../../domain/facts/facts.ts';
import { type Resolver, type Source, walk } from '../source/source.ts';

export const fileChains = (source: Source, resolver: Resolver): Chain[] => {
  const declared = declaredIn(source, resolver);
  const chains: Chain[] = [];
  walk(source.sourceFile, (node) => {
    if (skipped(node)) return false;
    if (isPropertyAccessExpression(node) && !isPropertyAccessExpression(node.parent)) {
      const chain = chainOf(node, source, declared);
      if (chain) chains.push(chain);
    }
    if (isIdentifier(node) && !isPropertyAccessExpression(node.parent)) {
      const root = declared.root(node);
      if (root) chains.push({ line: source.line(node), root, hops: [], call: isCalled(node) });
    }
    return undefined;
  });
  return chains;
};

const typeNodes = (node: Node): boolean =>
  node.kind >= SyntaxKind.FirstTypeNode && node.kind <= SyntaxKind.LastTypeNode;

const skipped = (node: Node): boolean =>
  typeNodes(node) ||
  node.kind === SyntaxKind.ImportDeclaration ||
  node.kind === SyntaxKind.ImportEqualsDeclaration ||
  node.kind === SyntaxKind.ExportDeclaration ||
  node.kind === SyntaxKind.ExportAssignment ||
  node.kind === SyntaxKind.InterfaceDeclaration ||
  node.kind === SyntaxKind.TypeAliasDeclaration ||
  (isHeritageClause(node) && node.token === SyntaxKind.ImplementsKeyword);

const unwrap = (expression: Expression): Expression =>
  isParenthesizedExpression(expression) || isNonNullExpression(expression) ? unwrap(expression.expression) : expression;

const isCalled = (node: Node): boolean => isCallExpression(node.parent) && node.parent.expression === node;

const chainOf = (outer: PropertyAccessExpression, source: Source, declared: DeclaredIn): Chain | undefined => {
  const accesses: PropertyAccessExpression[] = [];
  let at: Expression = outer;
  while (isPropertyAccessExpression(at)) {
    accesses.unshift(at);
    at = unwrap(at.expression);
  }
  const root = isIdentifier(at) ? declared.root(at) : undefined;
  const hops = accesses.flatMap((access) => {
    if (!isIdentifier(access.name)) return [];
    const hop = declared.hop(access.name, root);
    return hop ? [hop] : [];
  });
  if (!root && hops.length === 0) return undefined;
  return { line: source.line(outer), ...(root ? { root } : {}), hops, call: isCalled(outer) };
};

interface DeclaredIn {
  root(identifier: Identifier): Declared | undefined;
  hop(name: Identifier, root: Declared | undefined): Declared | undefined;
}

interface Lookup {
  source: Source;
  resolver: Resolver;
  tops: Map<Symbol, Symbol | undefined>;
}

const declaredIn = (source: Source, resolver: Resolver): DeclaredIn => {
  const lookup: Lookup = { source, resolver, tops: new Map() };
  return { root: (identifier) => rootOf(lookup, identifier), hop: (name, root) => hopOf(lookup, name, root) };
};

const otherFile = ({ source, resolver }: Lookup, symbol: Symbol): string | undefined => {
  const file = symbol.declarations.map((declaration) => resolver.relative(declaration.path)).find(Boolean);
  return file === source.file ? undefined : file;
};

const valueSymbol = ({ source, resolver }: Lookup, identifier: Identifier): Symbol | undefined =>
  isShorthandPropertyAssignment(identifier.parent)
    ? resolver.checker.getShorthandAssignmentValueSymbol(identifier.parent)
    : source.symbolOf(identifier);

const rootOf = (lookup: Lookup, identifier: Identifier): Declared | undefined => {
  const { checker } = lookup.resolver;
  const symbol = valueSymbol(lookup, identifier);
  if (!symbol || !(symbol.flags & SymbolFlags.Alias)) return undefined;
  const target = checker.getAliasedSymbol(symbol);
  if (checker.isUnknownSymbol(target) || !(target.flags & SymbolFlags.Value)) return undefined;
  const file = otherFile(lookup, target);
  return file ? { file, name: isFileSymbol(target) ? '*' : target.name } : undefined;
};

const hopOf = (lookup: Lookup, name: Identifier, root: Declared | undefined): Declared | undefined => {
  const symbol = lookup.source.symbolOf(name);
  const file = symbol && otherFile(lookup, symbol);
  if (!symbol || !file) return undefined;
  const top = topOf(lookup, symbol);
  if (top === symbol) return { file, name: symbol.name };
  if (top) return { file, name: top.name, member: symbol.name };
  return root && root.name !== '*' ? { file: root.file, name: root.name, member: symbol.name } : undefined;
};

const topOf = ({ tops }: Lookup, symbol: Symbol): Symbol | undefined => {
  if (!tops.has(symbol)) {
    let top = symbol;
    for (let parent = top.getParent(); parent && !isFileSymbol(parent); parent = parent.getParent()) top = parent;
    tops.set(symbol, top.name.startsWith('__') ? undefined : top);
  }
  return tops.get(symbol);
};

const isFileSymbol = (symbol: Symbol): boolean =>
  symbol.declarations.some((declaration) => declaration.kind === SyntaxKind.SourceFile);
