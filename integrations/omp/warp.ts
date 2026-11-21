/**
 * An omp extension that runs `warp diff` after each file edit and hands any new or worse findings to the model as
 * additional context for its next request, without blocking the edit. Copy or link it into the project's
 * `.omp/extensions/` (or `~/.omp/agent/extensions/` for every project).
 *
 * WARP_BASE sets the ref to diff against (default HEAD). WARP_RULESET picks a ruleset from the config, such as
 * `edit` (default: the config's default export). WARP_COMMAND sets the command (default `warp`), such as
 * `pnpm exec warp` for a project's own dev dependency.
 */

type ToolResultEvent = { toolName: string; isError: boolean };
type ToolResultEventResult = { additionalContext?: string };
type ExecResult = { stdout: string; stderr: string; code: number };
type Context = { cwd: string };

export type Extension = {
  on(event: 'tool_result', handler: (event: ToolResultEvent, context: Context) => Promise<ToolResultEventResult | undefined>): void;
  exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
};

/** omp's built-in tools that change files. */
export const editTools = new Set(['edit', 'write', 'ast_edit', 'apply_patch']);

export default function warp(pi: Extension, env: Record<string, string | undefined> = process.env): void {
  // Split on spaces, so `pnpm exec warp` runs a project's own dev dependency.
  const [command, ...prefix] = (env.WARP_COMMAND ?? 'warp').trim().split(/\s+/);
  const base = env.WARP_BASE ?? 'HEAD';
  const ruleset = env.WARP_RULESET ? ['--ruleset', env.WARP_RULESET] : [];
  pi.on('tool_result', async (event, context) => {
    if (event.isError || !editTools.has(event.toolName)) return undefined;
    const run = await pi.exec(command, [...prefix, 'diff', base, ...ruleset, '--reporter', 'omp'], { cwd: context.cwd, timeout: 60_000 });
    // A broken run (no config, not a repository) stays out of the model's context.
    if (run.code !== 0 || run.stdout.trim() === '') return undefined;
    return JSON.parse(run.stdout) as ToolResultEventResult;
  });
}
