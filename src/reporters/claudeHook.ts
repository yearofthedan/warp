import { actionable, agentContext, type Reporter } from './reporter.ts';
import { diffText, line } from './text.ts';

const warnWithoutBlocking = 1;

export const claudeHookReporter: Reporter = {
  id: 'claude-hook',
  render: (report) =>
    actionable(report).length === 0
      ? ''
      : JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext: agentContext(report, { delta: diffText, finding: line }),
          },
        }),
  failureExitCode: warnWithoutBlocking,
};
