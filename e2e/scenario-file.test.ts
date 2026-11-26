import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { printed, readScenario } from './scenario-file.ts';

const fenced = (info: string, body: string) => `\`\`\`${info}\n${body}\n\`\`\`\n`;
const config = fenced('yaml warp.yaml', 'root: {}');
const command = fenced('sh', 'warp check');

describe('scenario files', () => {
  it('reads the files given before the command, and keeps what was stated', () => {
    const text = `Rule: r\n\n${config}\n${fenced('ts src/a.ts', 'export const a = 1;')}\n${command}\n${fenced('text stdout', 'old')}`;
    const scenario = readScenario(text, 'x.md');
    assert.deepEqual(
      [...scenario.files],
      [
        ['warp.yaml', 'root: {}\n'],
        ['src/a.ts', 'export const a = 1;\n'],
      ],
    );
    assert.deepEqual(scenario.args, ['check']);
    assert.equal(scenario.stated, text.slice(0, text.indexOf('```text')).trimEnd());
  });

  it('prints only the streams that have output, the exit code when it is not 0, and hides the project folder', () => {
    const scenario = readScenario(`${config}\n${command}`, 'x.md');
    assert.equal(
      printed(scenario, { stdout: '', stderr: '/tmp/p/warp.yaml: bad\n', status: 2 }, '/tmp/p'),
      `${config}\n${command}\n${fenced('text stderr', '<project>/warp.yaml: bad')}\n${fenced('text exit', '2')}`,
    );
    assert.equal(
      printed(scenario, { stdout: 'No findings.\n', stderr: '', status: 0 }, '/tmp/p'),
      `${config}\n${command}\n${fenced('text stdout', 'No findings.')}`,
    );
  });

  it('refuses a file that is not a scenario', () => {
    const refusal = (text: string) => {
      try {
        readScenario(text, 'x.md');
        return 'read';
      } catch (error) {
        return (error as Error).message;
      }
    };
    assert.deepEqual(
      [
        refusal(config),
        refusal(command),
        refusal(`${config}${fenced('ts', 'x')}${command}`),
        refusal(`${config}${config}${command}`),
        refusal(`${config}${fenced('sh', 'node cli.ts')}`),
        refusal(`${config}\`\`\`sh\nwarp check`),
      ],
      [
        'x.md: has no sh block with the warp command to run',
        'x.md: gives no warp.yaml',
        'x.md:6: a block before the command names its file, such as: ts src/a.ts',
        'x.md: warp.yaml is given twice',
        'x.md: the sh block holds one warp command, such as: warp check',
        'x.md:4: a code block is never closed',
      ],
    );
  });
});
