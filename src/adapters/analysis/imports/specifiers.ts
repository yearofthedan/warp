import { SyntaxKind } from 'typescript/ast';
import type { Node, SourceFile, StringLiteralLikeNode } from 'typescript/ast';
import {
  isCallExpression,
  isExportDeclaration,
  isExternalModuleReference,
  isIdentifier,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isImportTypeNode,
  isLiteralTypeNode,
  isStringLiteralLikeNode,
} from 'typescript/ast/is';
import { walk } from '../source/source.ts';

export interface InlineReference {
  node: Node;
  specifier: StringLiteralLikeNode;
  typeOnly: boolean;
  require: boolean;
}

export const inlineReferences = (sourceFile: SourceFile): InlineReference[] => {
  const found: InlineReference[] = [];
  walk(sourceFile, (node) => {
    const reference = inlineReference(node);
    if (reference) found.push(reference);
  });
  return found;
};

const inlineReference = (node: Node): InlineReference | undefined => {
  if (isImportTypeNode(node))
    return isLiteralTypeNode(node.argument) && isStringLiteralLikeNode(node.argument.literal)
      ? { node, specifier: node.argument.literal, typeOnly: true, require: false }
      : undefined;
  if (!isCallExpression(node)) return undefined;
  const [specifier] = node.arguments;
  if (!specifier || !isStringLiteralLikeNode(specifier)) return undefined;
  if (node.expression.kind === SyntaxKind.ImportKeyword) return { node, specifier, typeOnly: false, require: false };
  const isRequire = isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length === 1;
  return isRequire ? { node, specifier, typeOnly: false, require: true } : undefined;
};

export const statementSpecifier = (node: Node): StringLiteralLikeNode | undefined => {
  const specifier =
    isImportDeclaration(node) || isExportDeclaration(node)
      ? node.moduleSpecifier
      : isImportEqualsDeclaration(node) && isExternalModuleReference(node.moduleReference)
        ? node.moduleReference.expression
        : undefined;
  return specifier && isStringLiteralLikeNode(specifier) ? specifier : undefined;
};

export const moduleSpecifiers = (sourceFile: SourceFile): string[] => [
  ...sourceFile.statements.flatMap((statement) => statementSpecifier(statement)?.text ?? []),
  ...inlineReferences(sourceFile).map((reference) => reference.specifier.text),
];
