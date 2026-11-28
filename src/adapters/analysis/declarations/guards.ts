import type { Statement } from 'typescript/ast';
import { isBlock, isIfStatement, isReturnStatement, isThrowStatement } from 'typescript/ast/is';

const exits = (statement: Statement | undefined): boolean =>
  statement !== undefined &&
  (isReturnStatement(statement) ||
    isThrowStatement(statement) ||
    (isBlock(statement) && exits(statement.statements.at(-1))));

export const isGuard = (statement: Statement): boolean =>
  isIfStatement(statement) && statement.elseStatement === undefined && exits(statement.thenStatement);
