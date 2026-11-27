import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { ConfigError } from '../../domain/model/configError.ts';
import { findConfig, parseConfig } from './loadConfig.ts';

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
  strict:
    rules: { no-cycle: off }
`;

describe('parseConfig', () => {
  it('finds the line of each place by the name a load error or finding gives it', () => {
    const { lines } = parseConfig(text, 'warp.yaml');
    assert.deepEqual(
      [
        'root.modules',
        'root.adapters',
        'root.adapters.dir',
        'root.adapters.modules',
        'root.adapters.db',
        'root.adapters.db.dependencies',
        'root.test',
        'root.test.provides',
        'root.test.modules',
        'root.tests',
        'card',
        'card.requires',
        'rulesets.strict.rules',
      ].map((path) => lines.get(path)),
      [2, 3, 4, 5, 6, 6, 7, 8, 9, 10, 12, 13, 16],
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
    assert.throws(() => parseConfig('root: {}\nroot: {}\n', 'warp.yaml'), {
      message: 'warp.yaml:2: Map keys must be unique (root)',
    });
    assert.throws(() => parseConfig('root:\n  dir: *\n', 'warp.yaml'), {
      message: "warp.yaml:2: a value that starts with * is quoted, '*'",
    });
  });
});

describe('findConfig', () => {
  it('takes the nearest warp.yaml from the folder up, and names the folder when there is none', () => {
    const configs = new Set(['/repo/warp.yaml', '/repo/packages/a/warp.yaml']);
    const find = (dir: string) => findConfig(dir, (path) => configs.has(path));
    assert.deepEqual(
      [find('/repo'), find('/repo/src/ui'), find('/repo/packages/a/src')],
      ['/repo/warp.yaml', '/repo/warp.yaml', '/repo/packages/a/warp.yaml'],
    );
    assert.throws(() => find('/elsewhere/src'), {
      message: 'no warp.yaml in /elsewhere/src or any folder above it',
    });
  });
});
