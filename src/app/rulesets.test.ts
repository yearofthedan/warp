import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { warp } from '../builtins/index.ts';
import { ConfigError } from '../domain/model/configError.ts';
import { loadConfigData } from './load.ts';
import { type Folders, resolveModel } from '../domain/model/resolve.ts';
import { anyRuleOn, settings } from '../domain/model/settings.ts';

const structure = `
root:
  modules:
    leaves: { dir: '*', archetype: leaf }
    core:
      dir: core
      modules:
        ports: { files: ports.ts }
archetypes:
  leaf:
    modules:
      src: { files: '*.ts' }
    test:
      modules:
        tests: { files: '*.test.ts' }
`;

const load = (yaml: string) => loadConfigData(parse(yaml), { builtins: warp }).config;

const failures = (yaml: string): string[] => {
  try {
    load(yaml);
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.message.split('\n');
  }
  assert.fail('expected a ConfigError');
};

const folders = (all: readonly string[]): Folders => {
  const dirs = new Set(all.flatMap((path) => (path.includes('/') ? [path.slice(0, path.lastIndexOf('/'))] : [])));
  return {
    folders: (folder) => [...dirs].filter((dir) => dir.startsWith(folder === '' ? '' : `${folder}/`)).sort(),
    exists: (path) => all.includes(path) || dirs.has(path),
  };
};

const settingsAt = (yaml: string, files: readonly string[], id: string) => {
  const config = load(yaml);
  const settled = settings(config, resolveModel(config, folders(files), files));
  return Object.fromEntries(
    files.map((file) => {
      const { on, options } = settled.atFile(file, id);
      return [file, on ? options : 'off'];
    }),
  );
};

describe('rulesets', () => {
  it('bind where they are written: the root, a module, an archetype, a test block', () => {
    const config = load(`
root:
  ruleset: { extends: [warp:recommended], rules: { module-cycle: off } }
  modules:
    leaves: { dir: '*', archetype: leaf, ruleset: { rules: { no-cycle: off } } }
  test: { ruleset: { rules: { function-cohesion: off } } }
archetypes:
  leaf:
    ruleset: { rules: { file-cohesion: { maxLines: 300 } } }
    modules:
      src: { files: '*.ts', ruleset: { rules: off } }
`);
    assert.deepEqual(config.archetypes.root!.ruleset!.at(-1), { 'module-cycle': false });
    assert.equal(config.archetypes.root!.ruleset![0]!['no-cycle'], true);
    assert.deepEqual(config.archetypes.root!.testRuleset, [{ 'function-cohesion': false }]);
    assert.deepEqual(config.archetypes.root!.modules[0]!.ruleset, [{ 'no-cycle': false }]);
    assert.deepEqual(config.archetypes.leaf!.ruleset, [{ 'file-cohesion': { maxLines: 300 } }]);
    assert.deepEqual(config.archetypes.leaf!.modules[0]!.ruleset, [{ '*': false }]);
  });

  it('turn on every built-in rule with warp:recommended', () => {
    const config = load(`${structure.replace('root:\n', 'root:\n  ruleset: { extends: [warp:recommended] }\n')}`);
    assert.deepEqual(
      Object.keys(config.archetypes.root!.ruleset![0]!),
      warp.rules.map((rule) => rule.id),
    );
  });

  it('lay extends in order, then their own rules', () => {
    const config = load(`
root:
  ruleset:
    extends: [loose, strict]
    rules: { file-cohesion: on, no-cycle: off, cognitive-complexity: { max: 12 } }
  modules: {}
rulesets:
  loose: { rules: { file-cohesion: { maxLines: 300 }, no-cycle: on, cognitive-complexity: { max: 20 } } }
  strict: { rules: { file-cohesion: { maxLines: 100 } } }
`);
    assert.deepEqual(config.archetypes.root!.ruleset, [
      { 'file-cohesion': { maxLines: 300 }, 'no-cycle': true, 'cognitive-complexity': { max: 20 } },
      { 'file-cohesion': { maxLines: 100 } },
      { 'file-cohesion': true, 'no-cycle': false, 'cognitive-complexity': { max: 12 } },
    ]);
  });

  it('refuse a named ruleset nothing extends, an unknown base, a loop, and what is not a ruleset', () => {
    assert.deepEqual(
      failures(`
root:
  ruleset: { extends: [a, missing], only: {} }
  modules: {}
rulesets:
  a: { extends: [b] }
  b: { extends: [a] }
  idle: { rules: {} }
  plain: [on]
  'x:y': {}
`),
      [
        "rulesets.x:y: a name has no ':', which marks a plugin's ruleset",
        'root.ruleset: unknown key only; a ruleset takes extends, rules',
        'rulesets.b.extends: a extends b extends a, a loop',
        "root.ruleset.extends: 'missing' is no ruleset; extend warp:recommended, a, b, idle, plain",
        "rulesets.idle: nothing extends it; a named ruleset applies through a ruleset's extends",
        "rulesets.plain: nothing extends it; a named ruleset applies through a ruleset's extends",
      ],
    );
    assert.deepEqual(failures('root: { modules: {}, ruleset: [x] }\nrulesets: [x]\n'), [
      'rulesets: expected rulesets by name, { strict: { rules: {...} } }',
      'root.ruleset: expected a ruleset, { extends: [warp:recommended], rules: {...} }',
    ]);
  });

  it('refuse a rule warp does not have, and a setting that is not on, off or options', () => {
    assert.deepEqual(failures('root: { modules: {}, ruleset: { rules: { no-such-rule: on, no-cycle: 3 } } }'), [
      'root.ruleset.rules: no rule called no-such-rule',
      'root.ruleset.rules.no-cycle: expected on, off or options',
    ]);
  });

  it('knows when no rule is on anywhere', () => {
    const at = (ruleset: string) =>
      anyRuleOn(load(structure.replace('    core:', `    core:\n      ruleset: ${ruleset}`)));
    assert.equal(anyRuleOn(load(structure)), false);
    assert.equal(at('{ rules: { module-cycle: off } }'), false);
    assert.equal(at('{ rules: { module-cycle: on } }'), true);
    assert.equal(at('{ rules: { module-cycle: off, no-cycle: on } }'), true);
    assert.equal(at('{ extends: [warp:recommended] }'), true);
  });
});

describe('the cascade', () => {
  const files = ['a.ts', 'cart/x.ts', 'cart/x.test.ts', 'core/ports.ts', 'core/other.ts'];

  it('runs nothing where no ruleset reaches', () => {
    assert.deepEqual(settingsAt(structure, files, 'no-cycle'), {
      'a.ts': 'off',
      'cart/x.ts': 'off',
      'cart/x.test.ts': 'off',
      'core/ports.ts': 'off',
      'core/other.ts': 'off',
    });
  });

  it('passes a ruleset down to every module inside, each adding its own on top', () => {
    const yaml = structure
      .replace('root:\n', 'root:\n  ruleset: { rules: { file-cohesion: { maxLines: 100 } } }\n')
      .replace('    core:\n', '    core:\n      ruleset: { rules: { file-cohesion: { maxLines: 50 } } }\n')
      .replace('ports: { files: ports.ts }', 'ports: { files: ports.ts, ruleset: { rules: { file-cohesion: off } } }')
      .replace('  leaf:\n', '  leaf:\n    ruleset: { rules: { file-cohesion: { maxLines: 300 } } }\n');
    assert.deepEqual(settingsAt(yaml, files, 'file-cohesion'), {
      'a.ts': { maxLines: 100 },
      'cart/x.ts': { maxLines: 300 },
      'cart/x.test.ts': { maxLines: 300 },
      'core/ports.ts': 'off',
      'core/other.ts': { maxLines: 50 },
    });
  });

  it('applies a use of an archetype after the archetype itself', () => {
    const yaml = structure
      .replace('archetype: leaf }', 'archetype: leaf, ruleset: { rules: { no-cycle: off } } }')
      .replace('  leaf:\n', '  leaf:\n    ruleset: { rules: { no-cycle: on } }\n');
    assert.equal(settingsAt(yaml, files, 'no-cycle')['cart/x.ts'], 'off');
  });

  it('gives a test file every production ruleset down to its module, then every test ruleset down to it', () => {
    const yaml = `
root:
  ruleset: { rules: { function-cohesion: { maxLines: 20 } } }
  test: { ruleset: { rules: { function-cohesion: off } } }
  modules:
    leaves: { dir: '*', archetype: leaf }
archetypes:
  leaf:
    ruleset: { rules: { function-cohesion: { maxLines: 10 } } }
    modules:
      src: { files: '*.ts' }
    test:
      ruleset: { rules: { function-cohesion: on } }
      modules:
        tests: { files: '*.test.ts', ruleset: { rules: { function-cohesion: { maxLines: 40 } } } }
`;
    const at = settingsAt(yaml, ['cart/x.ts', 'cart/x.test.ts'], 'function-cohesion');
    assert.deepEqual(at, { 'cart/x.ts': { maxLines: 10 }, 'cart/x.test.ts': { maxLines: 40 } });
    const withoutOwn = yaml.replace(', ruleset: { rules: { function-cohesion: { maxLines: 40 } } }', '');
    assert.deepEqual(settingsAt(withoutOwn, ['cart/x.test.ts'], 'function-cohesion'), {
      'cart/x.test.ts': { maxLines: 10 },
    });
    const withoutLeaf = withoutOwn.replace('      ruleset: { rules: { function-cohesion: on } }\n', '');
    assert.deepEqual(settingsAt(withoutLeaf, ['cart/x.test.ts'], 'function-cohesion'), { 'cart/x.test.ts': 'off' });
  });

  it("gives a files module's test module the files module's rulesets", () => {
    const yaml = `
root:
  modules:
    f:
      files: 'f*.ts'
      ruleset: { rules: { no-cycle: on, file-cohesion: on } }
      test: { ruleset: { rules: { no-cycle: off } }, modules: { u: { files: '*.test.ts' } } }
`;
    const config = load(yaml);
    const paths = ['f.ts', 'f.test.ts'];
    const settled = settings(config, resolveModel(config, folders(paths), paths));
    assert.deepEqual(
      paths.map((file) => [settled.atFile(file, 'no-cycle').on, settled.atFile(file, 'file-cohesion').on]),
      [
        [true, true],
        [false, true],
      ],
    );
  });
});
