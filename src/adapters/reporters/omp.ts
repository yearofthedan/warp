import { actionable, type Reporter } from './reporter.ts';
import { agentContext } from './agent.ts';

export const ompReporter: Reporter = {
  id: 'omp',
  render: (report) =>
    actionable(report).length === 0 ? '' : JSON.stringify({ additionalContext: agentContext(report) }),
};
