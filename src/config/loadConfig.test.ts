import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { ConfigError } from '../model/configError.ts';
import { parseConfig } from './loadConfig.ts';

const text = `root:
  modules:
    adapters:
      dir: src/adapters
      modules:
        db: { dir: db, dependencies: [domain] }
  test:
    provides: [npm:vitest]
    modules:
      tests: { files: '*.test.ts' }
archetypes:
  card:
    requires: [log]
rulesets:
  default:
    on: { root.adapters: off }
`;

describe('parseConfig', () => {
  it('finds the line of each place by the name a load error or finding gives it', () => {
    const { lines } = parseConfig(text, 'warp.yaml');
    assert.deepEqual(
      [
        'root.adapters',
        'root.adapters.dir',
        'root.adapters.db',
        'root.adapters.db.dependencies',
        'root.test',
        'root.test.provides',
        'root.tests',
        'card',
        'card.requires',
        'rulesets.default.on.root.adapters',
      ].map((path) => lines.get(path)),
      [3, 4, 6, 6, 7, 8, 10, 12, 13, 16],
    );
  });

  it('refuses anchors, aliases and repeated keys, at their lines', () => {
    assert.throws(
      () => parseConfig('root:\n  modules: &m {}\nother: *m\n', 'warp.yaml'),
      (error) =>
        error instanceof ConfigError &&
        error.message ===
          'warp.yaml:2: anchors and aliases are not part of warp.yaml; write it out\nwarp.yaml:3: anchors and aliases are not part of warp.yaml; write it out',
    );
    assert.throws(() => parseConfig('root: {}\nroot: {}\n', 'warp.yaml'), /: warp\.yaml:2: Map keys must be unique$/);
  });
});
