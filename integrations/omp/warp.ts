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
  pi.on('tool_result', async (event, context) => {
    if (event.isError || !editTools.has(event.toolName)) return undefined;
    const run = await pi.exec(command, [...prefix, 'diff', base, ...ruleset, '--reporter', 'omp'], {
      cwd: context.cwd,
      timeout: 60_000,
    });
    if (run.code !== 0 || run.stdout.trim() === '') return undefined;
    return JSON.parse(run.stdout) as ToolResultEventResult;
  });
}
