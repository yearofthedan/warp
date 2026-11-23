import type { Finding, Site } from './rule.ts';

export interface Delta {
  added: Finding[];
  worsened: (Finding & { was: number })[];
  resolved: Finding[];
}

const partKey = (rule: string, part: string) => `${rule}\0${part}`;

export const diff = (base: Finding[], head: Finding[]): Delta => {
  const byKey = new Map(base.map((finding) => [finding.key, finding]));
  const byPart = new Map(
    base.flatMap((finding) => finding.parts?.map((part) => [partKey(finding.rule, part), finding] as const) ?? []),
  );
  const matched = new Set<Finding>();
  const added: Finding[] = [];
  const worsened: Delta['worsened'] = [];
  for (const finding of head) {
    const was =
      byKey.get(finding.key) ??
      finding.parts?.map((part) => byPart.get(partKey(finding.rule, part))).find((match) => match !== undefined);
    if (!was) added.push(finding);
    else {
      matched.add(was);
      if (finding.value > was.value) worsened.push({ ...finding, was: was.value });
    }
  }
  return { added, worsened, resolved: base.filter((finding) => !matched.has(finding)) };
};

export const anchorAtChange = (delta: Delta, changed: () => (site: Site) => boolean): Delta => {
  const actionable = [...delta.added, ...delta.worsened];
  if (!actionable.some((finding) => finding.sites)) return delta;
  const isChanged = changed();
  const anchor = <F extends Finding>(finding: F): F => {
    const site = finding.sites?.find(isChanged);
    return site ? { ...finding, file: site.file, line: site.line } : finding;
  };
  return { added: delta.added.map(anchor), worsened: delta.worsened.map(anchor), resolved: delta.resolved };
};
