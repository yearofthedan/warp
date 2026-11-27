import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { loadConfigData } from '../app/load.ts';
import { type Folders, resolveModel } from '../domain/model/resolve.ts';
import { rulesOf } from '../domain/model/settings.ts';
import { builtinRules, warp } from './index.ts';

const folders: Folders = { folders: () => ['strings', 'domain'], exists: () => true };

describe('warp:utility', () => {
  it('turns off, on the module that takes it, the rules that judge how widely its exports are used', () => {
    const { config } = loadConfigData(
      parse(`
root:
  ruleset: [warp:recommended]
  modules:
    strings: { dir: strings, exposes: all, ruleset: [warp:utility] }
    domain: { dir: domain, exposes: all }
`),
      { builtins: warp },
    );
    const paths = ['strings/a.ts', 'domain/a.ts'];
    const model = resolveModel(config, folders, paths);
    const rules = rulesOf(config, model, builtinRules);
    const off = (id: string) =>
      model.modules.filter((module) => rules.module(module)[id] === false).map(({ id }) => id);
    assert.deepEqual(
      builtinRules
        .map(({ id }) => id)
        .filter((id) => off(id).length > 0)
        .map((id) => [id, off(id)]),
      [['export-consumers', ['strings']]],
    );
  });
});
