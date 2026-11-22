import type { Identifier, Node, SourceFile } from 'typescript/ast';
import { isIdentifier } from 'typescript/ast/is';
import type { Checker, Symbol } from 'typescript/sync';

export interface Source {
  file: string;
  sourceFile: SourceFile;
  symbolOf: (identifier: Identifier) => Symbol | undefined;
  line: (node: Node) => number;
  endLine: (node: Node) => number;
}

export const readSource = (checker: Checker, sourceFile: SourceFile, file: string): Source => {
  const identifiers: Identifier[] = [];
  walk(sourceFile, (node) => {
    if (isIdentifier(node)) identifiers.push(node);
  });
  const symbols = identifiers.length > 0 ? checker.getSymbolAtLocation(identifiers) : [];
  const byNode = new Map<Node, Symbol | undefined>(
    identifiers.map((identifier, index) => [identifier, symbols[index]]),
  );
  return {
    file,
    sourceFile,
    symbolOf: (identifier) => byNode.get(identifier),
    line: (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    endLine: (node) => sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
  };
};

export const symbolKey = (symbol: Symbol | undefined): string | undefined => {
  const declaration = symbol?.declarations[0];
  return declaration ? `${declaration.path}#${declaration.index}` : undefined;
};

export const walk = (node: Node, visit: (node: Node) => boolean | void): void => {
  if (visit(node) === false) return;
  node.forEachChild((child) => {
    walk(child, visit);
  });
};

export const countLines = (text: string): number => text.replace(/\n$/, '').split('\n').length;
