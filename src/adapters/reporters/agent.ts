import { actionable, type Report, ruleDocs } from './reporter.ts';
import { diffLines, diffSummary, line } from './text.ts';

export const shownFindings = 20;
export const shownChars = 500;

export const agentContext = (report: Report): string => {
  const body =
    report.mode === 'diff'
      ? [
          'New or worse architecture fitness findings. Address them if this edit caused them:',
          ...shown(diffLines(report.delta)),
          '',
          diffSummary(report.delta),
        ]
      : ['Architecture fitness findings:', ...shown(report.findings.map(line))];
  const docs = ruleDocs(actionable(report));
  return [
    ...body,
    ...(docs.length === 0 ? [] : ['', 'Rule docs:', ...docs.map(([rule, url]) => `- ${rule}: ${url}`)]),
  ].join('\n');
};

const shown = (lines: string[]): string[] => [
  ...lines.slice(0, shownFindings).map(clipped),
  ...(lines.length > shownFindings ? [`...and ${lines.length - shownFindings} more, not shown here.`] : []),
];

const clipped = (text: string): string => (text.length > shownChars ? `${text.slice(0, shownChars)}...` : text);
