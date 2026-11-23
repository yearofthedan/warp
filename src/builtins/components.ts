import type { Member, MemberGraph, MemberKind } from '../model/facts.ts';

export const components = (graph: MemberGraph, counted: readonly MemberKind[]): Member[][] => {
  const parent = graph.members.map((_, index) => index);
  const root = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  for (const [a, b] of graph.links) parent[root(a)] = root(b);

  const groups = new Map<number, Member[]>();
  graph.members.forEach((member, index) => {
    const key = root(index);
    groups.set(key, [...(groups.get(key) ?? []), member]);
  });
  return [...groups.values()]
    .filter((group) => group.some((member) => counted.includes(member.kind)))
    .sort((a, b) => a[0].line - b[0].line);
};
