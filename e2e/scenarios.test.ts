import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { globSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, it } from 'vite-plus/test';
import { printed, readScenario, type Scenario } from './scenario-file.ts';

const repo = join(import.meta.dirname, '..');
const cli = join(repo, 'src/cli.ts');
const approving = new Set(
  (process.env.WARP_APPROVE ?? '')
    .split('\n')
    .filter(Boolean)
    .map((file) => resolve(file)),
);

const tsconfig = `{
  "compilerOptions": { "target": "es2022", "module": "nodenext", "strict": true, "noEmit": true, "allowImportingTsExtensions": true },
  "include": ["src"]
}
`;

const play = (scenario: Scenario) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'warp-scenario-')));
  const files = new Map([['tsconfig.json', tsconfig], ...scenario.files]);
  for (const [file, text] of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  const run = spawnSync(process.execPath, [cli, ...scenario.args], { cwd: root, encoding: 'utf8' });
  return printed(scenario, { stdout: run.stdout, stderr: run.stderr, status: run.status ?? -1 }, root);
};

const all = globSync('src/**/scenarios/*.approved.md', { cwd: repo }).sort();
const chosen = approving.size === 0 ? all : all.filter((file) => approving.has(join(repo, file)));

describe('scenarios', () => {
  if (approving.size > 0)
    it('approves only scenario files', () => {
      const unknown = [...approving].filter((file) => !all.includes(relative(repo, file)));
      assert.deepEqual(unknown, [], 'not a scenario file: src/**/scenarios/*.approved.md');
    });

  for (const file of chosen)
    it.concurrent(file, () => {
      const text = readFileSync(join(repo, file), 'utf8');
      const observed = play(readScenario(text, file));
      if (approving.size > 0) writeFileSync(join(repo, file), observed);
      else assert.equal(observed, text, `${file} differs from this run; ./do approve ${file} records it`);
    });
});
