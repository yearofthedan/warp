type ToolResultEvent = { toolName: string; isError: boolean };
type ToolResultEventResult = { additionalContext?: string };
type ExecResult = { stdout: string; stderr: string; code: number };
type Context = { cwd: string };

export type Extension = {
  on(
    event: 'tool_result',
    handler: (event: ToolResultEvent, context: Context) => Promise<ToolResultEventResult | undefined>,
  ): void;
  exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
};

export const editTools = new Set(['edit', 'write', 'ast_edit', 'apply_patch']);

export default function warp(pi: Extension, env: Record<string, string | undefined> = process.env): void {
  const [command, ...prefix] = (env.WARP_COMMAND ?? 'warp').trim().split(/\s+/);
  const base = env.WARP_BASE ?? 'HEAD';
  const ruleset = env.WARP_RULESET ? ['--ruleset', env.WARP_RULESET] : [];
  let reported: string | undefined;
  const health = (problem: string | undefined): ToolResultEventResult | undefined => {
    const changed = problem !== reported;
    reported = problem;
    return problem && changed
      ? { additionalContext: `Warp architecture feedback is unavailable, so edits are not checked: ${problem}` }
      : undefined;
  };
  pi.on('tool_result', async (event, context) => {
    if (event.isError || !editTools.has(event.toolName)) return undefined;
    const run = await pi
      .exec(command, [...prefix, 'diff', base, '--since-last-run', ...ruleset, '--reporter', 'omp'], {
        cwd: context.cwd,
        timeout: 60_000,
      })
      .catch((error: unknown): ExecResult => ({ stdout: '', stderr: String(error), code: -1 }));
    if (run.code !== 0) return health(run.stderr.trim() || `${command} exited with code ${run.code}`);
    health(undefined);
    return run.stdout.trim() === '' ? undefined : (JSON.parse(run.stdout) as ToolResultEventResult);
  });
}
