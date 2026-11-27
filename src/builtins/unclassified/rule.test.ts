import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { checkModel } from '../../app/checkModel.ts';
import { loadConfigData } from '../../app/load.ts';
import { type Folders, resolveModel } from '../../domain/model/resolve.ts';
import { unclassified } from './rule.ts';

const folders = (all: readonly string[]): Folders => {
  const dirs = new Set(all.flatMap((path) => (path.includes('/') ? [path.slice(0, path.lastIndexOf('/'))] : [])));
  return {
    folders: (folder) => (folder === '' ? [...dirs].sort() : []),
    exists: (path) => all.includes(path) || dirs.has(path),
  };
};

describe('unclassified', () => {
  const yaml = `
root:
  ruleset: { rules: { unclassified: on } }
  modules:
    quiet: { dir: quiet, archetype: leaf, ruleset: { rules: { unclassified: off } } }
    loud: { dir: loud, archetype: leaf }
    flat: { dir: flat }
archetypes:
  leaf: { entry: index.ts, modules: { src: { files: '*.ts' } } }
`;
  const paths = ['stray.ts', 'quiet/a.css', 'loud/c.css', 'loud/d.ts', 'loud/index.ts', 'flat/e.css'];

  it('reports each file in a module with modules that none of them claims, where it is on', () => {
    const config = loadConfigData(parse(yaml)).config;
    const findings = checkModel(config, resolveModel(config, folders(paths), paths), { files: [] }, [unclassified]);
    assert.deepEqual(
      findings.map(({ rule, key, file, module, message }) => [rule, key, file, module, message]),
      [
        [
          'unclassified',
          'unclassified:stray.ts',
          'stray.ts',
          '(root)',
          "stray.ts is in no module of the root, so nothing says what it may import. Add a files module to root that matches it, or move it into a module's folder.",
        ],
        [
          'unclassified',
          'unclassified:loud/c.css',
          'loud/c.css',
          'loud',
          "loud/c.css is in no module of loud (leaf), so nothing says what it may import. Add a files module to leaf that matches it, or move it into a module's folder.",
        ],
      ],
    );
  });
});
