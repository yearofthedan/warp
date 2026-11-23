import { actionable, agentContext, type Reporter, unavailable } from './reporter.ts';
import { diffText, line } from './text.ts';

const warnWithoutBlocking = 1;

const response = (additionalContext: string): string =>
  JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } });

export const claudeHookReporter: Reporter = {
  id: 'claude-hook',
  render: (report) =>
    actionable(report).length === 0 ? '' : response(agentContext(report, { delta: diffText, finding: line })),
  renderFailure: (problem) => response(unavailable(problem)),
  failureExitCode: warnWithoutBlocking,
};
