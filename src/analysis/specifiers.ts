import type { SourceFile } from 'typescript/ast';
import { isExportDeclaration, isImportDeclaration, isStringLiteralLikeNode } from 'typescript/ast/is';

export const moduleSpecifiers = (sourceFile: SourceFile): string[] =>
  sourceFile.statements.flatMap((statement) =>
    (isImportDeclaration(statement) || isExportDeclaration(statement)) &&
    statement.moduleSpecifier &&
    isStringLiteralLikeNode(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  );
