import type { Delta } from '../../domain/rules/diff.ts';
import type { Finding } from '../../domain/rules/rule.ts';
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
  const groups = Map.groupBy(findings, (finding) => `${finding.rule}\t${finding.module ?? finding.file}`);
  const rows = [...groups]
    .map(([group, members]) => [...group.split('\t').map(escaped), String(members.length)] as const)
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
  const lines = diffLines(delta);
  return [...lines, ...(lines.length > 0 ? [''] : []), diffSummary(delta)].join('\n');
};

export const diffLines = (delta: Delta): string[] => [
  ...delta.added.map((finding) => `new: ${line(finding)}`),
  ...delta.worsened.map((finding) => `worse (was ${finding.was}): ${line(finding)}`),
];

export const diffSummary = (delta: Delta): string =>
  `${count(delta.added.length, 'new finding')}, ${delta.worsened.length} worsened, ${delta.resolved.length} resolved.`;

export const line = (finding: Finding): string =>
  escaped(`${finding.file}:${finding.line} [${finding.rule}] ${finding.message}`);

const escaped = (text: string): string =>
  text.replaceAll(/[\p{Cc}\u2028\u2029]/gu, (char) =>
    JSON.stringify(char).length === 4
      ? JSON.stringify(char).slice(1, -1)
      : `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;
