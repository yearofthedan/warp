import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import warp, { type Extension } from './warp.ts';

type Handler = Parameters<Extension['on']>[1];

type Run = { stdout: string; stderr?: string; code?: number } | Error;

const extension = (stdout: string, code = 0, env: Record<string, string> = { WARP_BASE: 'main...' }) =>
  runs([{ stdout, code }], env);

const runs = (results: Run[], env: Record<string, string> = {}) => {
  const calls: { command: string; args: string[]; cwd?: string }[] = [];
  let handler: Handler | undefined;
  const pi: Extension = {
    on: (_event, h) => {
      handler = h;
    },
    exec: async (command, args, options) => {
      calls.push({ command, args, cwd: options?.cwd });
      const result = results[Math.min(calls.length, results.length) - 1]!;
      if (result instanceof Error) throw result;
      return { stderr: '', code: 0, ...result };
    },
  };
  warp(pi, env);
  return { calls, fire: (toolName: string, isError = false) => handler?.({ toolName, isError }, { cwd: '/repo' }) };
};

describe('omp extension', () => {
  it('diffs after an edit and returns the reporter output as additional context', async () => {
    const { calls, fire } = extension('{"additionalContext":"new: src/a.ts:1"}\n');
    assert.deepEqual(await fire('edit'), { additionalContext: 'new: src/a.ts:1' });
    assert.deepEqual(calls, [
      { command: 'warp', args: ['diff', 'main...', '--since-last-run', '--reporter', 'omp'], cwd: '/repo' },
    ]);
  });

  it('runs a command with arguments, such as pnpm exec', async () => {
    const { calls, fire } = extension('', 0, { WARP_COMMAND: 'pnpm exec warp' });
    await fire('write');
    assert.deepEqual(
      calls.map((call) => [call.command, call.args]),
      [['pnpm', ['exec', 'warp', 'diff', 'HEAD', '--since-last-run', '--reporter', 'omp']]],
    );
  });

  it('passes a ruleset', async () => {
    const { calls, fire } = extension('', 0, { WARP_RULESET: 'edit' });
    await fire('edit');
    assert.deepEqual(calls[0].args, ['diff', 'HEAD', '--since-last-run', '--ruleset', 'edit', '--reporter', 'omp']);
  });

  it('skips tools that change no files, failed edits and empty deltas', async () => {
    assert.equal(await extension('{}').fire('read'), undefined);
    assert.equal(await extension('{}').fire('write', true), undefined);
    assert.equal(await extension('').fire('write'), undefined);
  });

  it('says once that warp is unavailable, until the failure changes or a run succeeds', async () => {
    const config = { stdout: '', stderr: 'warp: warp.config.ts: no module called domian\n', code: 2 };
    const { fire } = runs([config, config, { stdout: '' }, config, new Error('spawn warp ENOENT')]);
    const unavailable = (problem: string) => ({
      additionalContext: `Warp architecture feedback is unavailable, so edits are not checked: ${problem}`,
    });
    assert.deepEqual(await fire('edit'), unavailable('warp: warp.config.ts: no module called domian'));
    assert.equal(await fire('edit'), undefined);
    assert.equal(await fire('edit'), undefined);
    assert.deepEqual(await fire('edit'), unavailable('warp: warp.config.ts: no module called domian'));
    assert.deepEqual(await fire('edit'), unavailable('Error: spawn warp ENOENT'));
  });

  it('names the exit code of a run that fails silently', async () => {
    const { fire } = runs([{ stdout: '', code: 127 }]);
    assert.deepEqual(await fire('edit'), {
      additionalContext:
        'Warp architecture feedback is unavailable, so edits are not checked: warp exited with code 127',
    });
  });
});
