import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { checkModel } from '../../app/checkModel.ts';
import { loadConfigData } from '../../app/load.ts';
import { type Folders, resolveModel } from '../../domain/model/resolve.ts';
import { unclassified } from './unclassified.ts';

const folders = (all: readonly string[]): Folders => {
  const dirs = new Set(all.flatMap((path) => (path.includes('/') ? [path.slice(0, path.lastIndexOf('/'))] : [])));
  return {
    folders: (folder) => (folder === '' ? [...dirs].sort() : []),
    exists: (path) => all.includes(path) || dirs.has(path),
  };
};

describe('unclassified', () => {
  it('reports loose files on the root and where a ruleset turns it on, and nowhere else', () => {
    const yaml = `
root:
  modules:
    quiet: { dir: quiet, archetype: quiet }
    denied: { dir: denied, archetype: denied }
archetypes:
  quiet: { modules: { src: { files: '*.ts' } } }
  denied: { modules: { src: { files: '*.ts' } } }
`;
    const on = `    on: { denied: { unclassified: on } }\n`;
    const config = loadConfigData(parse(`${yaml}rulesets:\n  default:\n    extends: [warp:recommended]\n${on}`)).config;
    const paths = ['stray.ts', 'quiet/a.css', 'denied/c.css', 'denied/d.ts'];
    assert.deepEqual(checkModel(config, resolveModel(config, folders(paths), paths), { files: [] }, [unclassified]), [
      {
        rule: 'unclassified',
        key: 'unclassified:stray.ts',
        file: 'stray.ts',
        line: 1,
        module: '(root)',
        value: 1,
        message:
          "stray.ts is in no module of the root, so nothing says what it may import. Add a files module to root that matches it, or move it into a module's folder.",
      },
      {
        rule: 'unclassified',
        key: 'unclassified:denied/c.css',
        file: 'denied/c.css',
        line: 1,
        module: 'denied',
        value: 1,
        message:
          "denied/c.css is in no module of denied (denied), so nothing says what it may import. Add a files module to denied that matches it, or move it into a module's folder.",
      },
    ]);
  });

  it("turns off for a module and the modules below it from the module's archetype", () => {
    const yaml = `
root:
  modules:
    leaf: { dir: leaf, archetype: leaf }
archetypes:
  leaf: { modules: { src: { files: '*.ts' } } }
rulesets:
  default:
    extends: [warp:recommended]
    rules: { unclassified: on }
    on: { root: { unclassified: off } }
`;
    const config = loadConfigData(parse(yaml)).config;
    const paths = ['stray.ts', 'leaf/a.css'];
    assert.deepEqual(
      checkModel(config, resolveModel(config, folders(paths), paths), { files: [] }, [unclassified]),
      [],
    );
  });
});
