import type { Delta } from '../model/diff.ts';
import type { Finding } from '../model/rule.ts';

export type Report = { mode: 'check'; findings: Finding[] } | { mode: 'diff'; delta: Delta };

export interface ReportContext {
  toolVersion: string;
  projectPath: string;
}

export interface Reporter {
  id: string;
  render: (report: Report, context: ReportContext) => string;
  failureExitCode?: number;
}

export const actionable = (report: Report): Finding[] =>
  report.mode === 'check' ? report.findings : [...report.delta.added, ...report.delta.worsened];

export const agentContext = (
  report: Report,
  render: { delta: (delta: Delta) => string; finding: (finding: Finding) => string },
): string => {
  const body =
    report.mode === 'diff'
      ? `Architecture fitness changes since the base commit. Address them if this edit caused them:\n${render.delta(report.delta)}`
      : `Architecture fitness findings:\n${report.findings.map(render.finding).join('\n')}`;
  const docs = ruleDocs(actionable(report));
  return docs.length === 0
    ? body
    : `${body}\n\nRule docs:\n${docs.map(([rule, url]) => `- ${rule}: ${url}`).join('\n')}`;
};

export const ruleDocs = (findings: Finding[]): [string, string][] => [
  ...new Map(findings.flatMap((finding): [string, string][] => (finding.docs ? [[finding.rule, finding.docs]] : []))),
];
