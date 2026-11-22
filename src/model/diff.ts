import type { Finding } from './rule.ts';

export interface Delta {
  added: Finding[];
  worsened: (Finding & { was: number })[];
  resolved: Finding[];
}

export const diff = (base: Finding[], head: Finding[]): Delta => {
  const before = new Map(base.map((finding) => [finding.key, finding]));
  const after = new Set(head.map((finding) => finding.key));
  const delta: Delta = { added: [], worsened: [], resolved: base.filter((finding) => !after.has(finding.key)) };
  for (const finding of head) {
    const was = before.get(finding.key);
    if (!was) delta.added.push(finding);
    else if (finding.value > was.value) delta.worsened.push({ ...finding, was: was.value });
  }
  return delta;
};
