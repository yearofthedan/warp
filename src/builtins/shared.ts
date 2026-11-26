import type { Member } from '../domain/facts/facts.ts';

export interface Group {
  names: string[];
  lines: [number, number];
}

export const group = (members: Member[]): Group => ({
  names: members.map((member) => member.name),
  lines: [Math.min(...members.map((member) => member.line)), Math.max(...members.map((member) => member.endLine))],
});

export const withOrdinals = <T extends { name: string }>(functions: T[]): [T, string][] => {
  const seen = new Map<string, number>();
  return functions.map((fn) => {
    const count = (seen.get(fn.name) ?? 0) + 1;
    seen.set(fn.name, count);
    return [fn, count === 1 ? fn.name : `${fn.name}#${count}`];
  });
};

export const title = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);
