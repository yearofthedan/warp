import type {
  AccessorDeclaration,
  ClassElement,
  ClassLikeDeclaration,
  Expression,
  MethodDeclaration,
  Node,
  ParameterDeclaration,
  PropertyDeclaration,
} from 'typescript/ast';
import {
  isArrowFunction,
  isClassDeclaration,
  isClassLikeDeclaration,
  isConstructorDeclaration,
  isFunctionDeclaration,
  isFunctionExpression,
  isGetAccessorDeclaration,
  isIdentifier,
  isMethodDeclaration,
  isPrivateIdentifier,
  isPropertyAccessExpression,
  isPropertyDeclaration,
  isSetAccessorDeclaration,
  isThisExpression,
  isVariableDeclaration,
} from 'typescript/ast/is';
import { getCombinedModifierFlags } from 'typescript/ast/utils';
import { ModifierFlags, type Symbol, SymbolFlags } from 'typescript/sync';
import type { ClassFacts, Member, MemberGraph } from '../../domain/facts/facts.ts';
import { type Source, symbolKey, walk } from './source.ts';

interface Part {
  member: Member;
  key: string | undefined;
  bodies: Node[];
}

interface Touch {
  key: string;
  symbol: Symbol;
  line: number;
}

export const classFacts = (source: Source): ClassFacts[] => {
  const facts: ClassFacts[] = [];
  walk(source.sourceFile, (node) => {
    if (isClassLikeDeclaration(node)) facts.push(classOf(node, source));
  });
  return facts;
};

const classOf = (node: ClassLikeDeclaration, source: Source): ClassFacts => {
  const line = source.line(node);
  const endLine = source.endLine(node);
  return { name: className(node, source), line, endLine, lines: endLine - line + 1, members: classGraph(node, source) };
};

const className = (node: ClassLikeDeclaration, source: Source): string => {
  if (node.name) return node.name.text;
  if (isVariableDeclaration(node.parent)) return node.parent.name.getText(source.sourceFile);
  return isClassDeclaration(node) ? 'default' : '<anonymous class>';
};

const classGraph = (node: ClassLikeDeclaration, source: Source): MemberGraph => {
  const self = selfKey(node, source);
  const parts = byKey(node.members.flatMap((element) => partsOf(element, source)));
  const members = parts.map((part) => part.member);
  const owner = new Map(parts.flatMap((part, index) => (part.key ? [[part.key, index] as const] : [])));
  const links: [number, number][] = [];
  parts.forEach((part, index) => {
    for (const touch of part.bodies.flatMap((body) => touches(body, self, source))) {
      let other = owner.get(touch.key);
      if (other === undefined && isField(touch.symbol)) {
        other = members.push({ name: touch.symbol.name, kind: 'state', line: touch.line, endLine: touch.line }) - 1;
        owner.set(touch.key, other);
      }
      if (other !== undefined && other !== index) links.push([index, other]);
    }
  });
  return { members, links };
};

const partsOf = (element: ClassElement, source: Source): Part[] => {
  if (isConstructorDeclaration(element)) {
    return element.parameters.filter(isParameterProperty).map((parameter) => part(parameter, 'state', [], source));
  }
  if (isMethodDeclaration(element)) return element.body ? [part(element, 'function', [element.body], source)] : [];
  if (isPropertyDeclaration(element)) {
    const value = element.initializer ? [element.initializer] : [];
    return [part(element, isFunctionValue(element.initializer) ? 'function' : 'state', value, source)];
  }
  if (isGetAccessorDeclaration(element) || isSetAccessorDeclaration(element)) {
    return [part(element, 'state', element.body ? [element.body] : [], source)];
  }
  return [];
};

const part = (
  node: MethodDeclaration | PropertyDeclaration | AccessorDeclaration | ParameterDeclaration,
  kind: 'function' | 'state',
  bodies: Node[],
  source: Source,
): Part => {
  const name = node.name;
  const key = isIdentifier(name) || isPrivateIdentifier(name) ? symbolKey(source.symbolOf(name)) : undefined;
  return {
    member: {
      name: name.getText(source.sourceFile),
      kind,
      line: source.line(node),
      endLine: source.endLine(node),
    },
    key,
    bodies,
  };
};

const byKey = (parts: Part[]): Part[] => {
  const kept = new Map<string, Part>();
  return parts.filter((candidate) => {
    const first = candidate.key ? kept.get(candidate.key) : undefined;
    if (!first) {
      if (candidate.key) kept.set(candidate.key, candidate);
      return true;
    }
    first.bodies.push(...candidate.bodies);
    return false;
  });
};

const touches = (body: Node, self: string | undefined, source: Source): Touch[] => {
  const found: Touch[] = [];
  walk(body, (node) => {
    if (node !== body && rebindsThis(node)) return false;
    if (!isPropertyAccessExpression(node) || !isSelf(node.expression, self, source)) return;
    const symbol = source.symbolOf(node.name);
    const key = symbolKey(symbol);
    if (symbol && key) found.push({ key, symbol, line: source.line(node) });
  });
  return found;
};

const rebindsThis = (node: Node): boolean =>
  isFunctionDeclaration(node) || isFunctionExpression(node) || isClassLikeDeclaration(node);

const isSelf = (expression: Expression, self: string | undefined, source: Source): boolean =>
  isThisExpression(expression) ||
  (self !== undefined && isIdentifier(expression) && symbolKey(source.symbolOf(expression)) === self);

const selfKey = (node: ClassLikeDeclaration, source: Source): string | undefined => {
  const name = node.name ?? (isVariableDeclaration(node.parent) ? node.parent.name : undefined);
  return name && isIdentifier(name) ? symbolKey(source.symbolOf(name)) : undefined;
};

const isField = (symbol: Symbol): boolean =>
  (symbol.flags & SymbolFlags.PropertyOrAccessor) !== 0 && (symbol.flags & SymbolFlags.Method) === 0;

const isParameterProperty = (parameter: ParameterDeclaration): boolean =>
  (getCombinedModifierFlags(parameter) & ModifierFlags.ParameterPropertyModifier) !== 0;

const isFunctionValue = (value: Expression | undefined): boolean =>
  value !== undefined && (isArrowFunction(value) || isFunctionExpression(value));
