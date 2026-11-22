import { actionable, agentContext, type Reporter } from './reporter.ts';
import { diffText, line } from './text.ts';

export const ompReporter: Reporter = {
  id: 'omp',
  render: (report) =>
    actionable(report).length === 0
      ? ''
      : JSON.stringify({ additionalContext: agentContext(report, { delta: diffText, finding: line }) }),
};
