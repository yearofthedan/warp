import type { Delta } from '../rules/diff.ts';
import type { Finding } from '../rules/rule.ts';
import type { Reporter } from './reporter.ts';

export const textReporter: Reporter = {
  id: 'text',
  render: (report) => (report.mode === 'check' ? checkText(report.findings) : diffText(report.delta)),
};

const checkText = (findings: Finding[]): string =>
  findings.length === 0
    ? 'No findings.'
    : [
        ...findings.map(line),
        '',
        'By rule and module:',
        ...summary(findings),
        '',
        count(findings.length, 'finding'),
      ].join('\n');

const summary = (findings: Finding[]): string[] => {
  const groups = Map.groupBy(findings, (finding) => `${finding.rule}\t${finding.module ?? '-'}`);
  const rows = [...groups]
    .map(([group, members]) => [...group.split('\t'), String(members.length)] as const)
    .toSorted(([rule, module, n], [otherRule, otherModule, other]) => {
      const byCount = Number(other) - Number(n);
      return byCount || rule.localeCompare(otherRule) || module.localeCompare(otherModule);
    });
  const width = (column: 0 | 1 | 2) => Math.max(...rows.map((row) => row[column].length));
  return rows.map(
    ([rule, module, n]) => `  ${rule.padEnd(width(0))}  ${module.padEnd(width(1))}  ${n.padStart(width(2))}`,
  );
};

export const diffText = (delta: Delta): string => {
  const lines = [
    ...delta.added.map((finding) => `new: ${line(finding)}`),
    ...delta.worsened.map((finding) => `worse (was ${finding.was}): ${line(finding)}`),
  ];
  const summary = `${count(delta.added.length, 'new finding')}, ${delta.worsened.length} worsened, ${delta.resolved.length} resolved.`;
  return [...lines, ...(lines.length > 0 ? [''] : []), summary].join('\n');
};

export const line = (finding: Finding): string =>
  `${finding.file}:${finding.line} [${finding.rule}] ${finding.message}`;

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;
