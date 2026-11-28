import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { loadConfigData } from '../app/load.ts';
import { type Folders, resolveModel } from '../domain/model/resolve.ts';
import { settings } from '../domain/model/settings.ts';
import { builtinRules, warp } from './index.ts';

const folders: Folders = { folders: () => ['strings', 'domain'], exists: () => true };

const rulesOffUnder = (preset: string, place: 'module' | 'test') => {
  const ruleset = `ruleset: [${preset}]`;
  const { config } = loadConfigData(
    parse(`
root:
  ruleset: [warp:boundaries, warp:cohesion, warp:coupling]
  modules:
    strings: { dir: strings, exposes: all${place === 'module' ? `, ${ruleset}` : ''} }
    domain: { dir: domain, exposes: all }
  test:
    ${place === 'test' ? ruleset : ''}
    modules: { tests: { files: 'strings/*.test.ts' }, domainTests: { files: 'domain/*.test.ts' } }
`),
    { builtins: warp },
  );
  const paths = ['strings/a.ts', 'strings/a.test.ts', 'domain/a.ts', 'domain/a.test.ts'];
  const model = resolveModel(config, folders, paths);
  const settled = settings(config, model);
  const offAt = (id: string) => paths.filter((path) => !settled.atFile(path, id).on);
  return builtinRules.flatMap(({ id }) => (offAt(id).length > 0 ? [[id, offAt(id)]] : []));
};

describe('warp:toolkit', () => {
  it('turns off how widely exports are used and file cohesion, on the module that takes it', () => {
    assert.deepEqual(rulesOffUnder('warp:toolkit', 'module'), [
      ['file-cohesion', ['strings/a.ts']],
      ['export-consumers', ['strings/a.ts']],
      ['export-surface', ['strings/a.ts']],
    ]);
  });
});

describe('warp:wiring', () => {
  it('turns off the counts of what a module reaches into, on the module that takes it', () => {
    assert.deepEqual(rulesOffUnder('warp:wiring', 'module'), [
      ['export-spread', ['strings/a.ts']],
      ['module-dependencies', ['strings/a.ts']],
    ]);
  });
});

describe('warp:test', () => {
  it('turns off the function measures that describe and it callbacks trip, on test code', () => {
    assert.deepEqual(rulesOffUnder('warp:test', 'test'), [
      ['function-cohesion', ['strings/a.test.ts', 'domain/a.test.ts']],
      ['cognitive-complexity', ['strings/a.test.ts', 'domain/a.test.ts']],
    ]);
  });
});
