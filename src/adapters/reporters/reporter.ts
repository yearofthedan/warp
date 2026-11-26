import type { Delta } from '../../domain/rules/diff.ts';
import type { Finding } from '../../domain/rules/rule.ts';

export type Report = { mode: 'check'; findings: Finding[] } | { mode: 'diff'; delta: Delta };

export interface ReportContext {
  toolVersion: string;
  projectPath: string;
}

export interface Reporter {
  id: string;
  render: (report: Report, context: ReportContext) => string;
  renderFailure?: (problem: string) => string;
  failureExitCode?: number;
}

export const unavailable = (problem: string): string =>
  `Warp architecture feedback is unavailable, so edits are not checked: ${problem}`;

export const actionable = (report: Report): Finding[] =>
  report.mode === 'check' ? report.findings : [...report.delta.added, ...report.delta.worsened];

export const ruleDocs = (findings: Finding[]): [string, string][] => [
  ...new Map(findings.flatMap((finding): [string, string][] => (finding.docs ? [[finding.rule, finding.docs]] : []))),
];
