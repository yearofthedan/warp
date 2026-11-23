import { actionable, type Reporter, unavailable } from './reporter.ts';
import { agentContext } from './agent.ts';

const warnWithoutBlocking = 1;

const response = (additionalContext: string): string =>
  JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } });

export const claudeHookReporter: Reporter = {
  id: 'claude-hook',
  render: (report) => (actionable(report).length === 0 ? '' : response(agentContext(report))),
  renderFailure: (problem) => response(unavailable(problem)),
  failureExitCode: warnWithoutBlocking,
};
