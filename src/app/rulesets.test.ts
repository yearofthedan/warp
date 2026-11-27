import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { builtinRegistry } from '../builtins/index.ts';
import { ConfigError } from '../domain/model/configError.ts';
import { loadConfigData } from './load.ts';
import { anyRuleOn } from '../domain/model/settings.ts';

const builtins = [...builtinRegistry.values()];

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

const load = (rulesets: string | undefined, name?: string) =>
  loadConfigData(parse(`${structure}${rulesets === undefined ? '' : `rulesets:\n${rulesets}`}`), {
    builtins,
    ...(name ? { ruleset: name } : {}),
  }).config;

const failures = (rulesets: string, name?: string): string[] => {
  try {
    load(rulesets, name);
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.message.split('\n');
  }
  assert.fail('expected a ConfigError');
};

const base = `
  default:
    extends: [warp:recommended]
    rules: { cognitive-complexity: { max: 15 }, module-cycle: off }
    on:
      leaf: { file-cohesion: { maxLines: 300 } }
      leaf.tests: off
`;

describe('rulesets', () => {
  it('apply the default ruleset at each level it names: the whole config, an archetype, a module', () => {
    const config = load(base);
    assert.deepEqual(config.rules, { 'cognitive-complexity': { max: 15 }, 'module-cycle': false });
    assert.deepEqual(config.archetypes.leaf!.rules, { 'file-cohesion': { maxLines: 300 } });
    assert.deepEqual(
      config.archetypes.leaf!.modules.map((module) => module.rules),
      [undefined, 'off'],
    );
    assert.equal(config.archetypes.root!.rules, undefined);
  });

  it('run nothing unless the chosen ruleset extends warp:recommended', () => {
    assert.equal(load(undefined).rules, 'off');
    assert.deepEqual(load('  default: { rules: { no-cycle: on } }').rules, { '*': false, 'no-cycle': true });
  });

  it('apply a named ruleset only when asked', () => {
    const edit = base.replace('default:', 'edit:');
    assert.equal(load(edit).rules, 'off');
    assert.deepEqual(load(edit, 'edit').archetypes.leaf!.rules, { 'file-cohesion': { maxLines: 300 } });
  });

  it('merge an extending ruleset after its base: options into options, off off, on on with the options kept', () => {
    const config = load(
      `${base}
  edit:
    extends: [default]
    rules:
      cognitive-complexity: { max: 12 }
      module-cycle: on
      no-cycle: off
      file-cohesion: { maxLines: 100 }
    on:
      leaf: { file-cohesion: off }
      leaf.tests: { no-cycle: on }
      root.leaves: off
`,
      'edit',
    );
    assert.deepEqual(config.rules, {
      'cognitive-complexity': { max: 12 },
      'module-cycle': true,
      'no-cycle': false,
      'file-cohesion': { maxLines: 100 },
    });
    assert.deepEqual(config.archetypes.leaf!.rules, { 'file-cohesion': false });
    assert.deepEqual(config.archetypes.leaf!.modules[1]!.rules, { '*': false, 'no-cycle': true });
    assert.equal(config.archetypes.root!.modules[0]!.rules, 'off');
  });

  it('keep the options when a later ruleset turns the rule on, and merge options into options', () => {
    const config = load(
      `
  default:
    extends: [warp:recommended]
    rules: { cognitive-complexity: { max: 15 }, file-cohesion: { maxLines: 300 } }
  edit:
    extends: [default]
    rules: { cognitive-complexity: on, file-cohesion: { maxLines: 100 } }
`,
      'edit',
    );
    assert.deepEqual(config.rules, { 'cognitive-complexity': { max: 15 }, 'file-cohesion': { maxLines: 100 } });
  });

  it('refuse on that is not settings by place', () => {
    assert.deepEqual(failures('  default: { extends: [warp:recommended], on: 3 }'), [
      'rulesets.default.on: expected settings by archetype or module, { app.adapters: {...} }',
    ]);
  });

  it('set every test module with test', () => {
    const config = load('  default: { extends: [warp:recommended], test: { function-cohesion: off } }');
    assert.deepEqual(config.archetypes.leaf!.modules[1]!.rules, { 'function-cohesion': false });
    assert.equal(config.archetypes.leaf!.modules[0]!.rules, undefined);
  });

  it('name a module inside an inline module by its path', () => {
    const config = load('  default: { extends: [warp:recommended], on: { root.core.ports: off } }');
    assert.equal(config.archetypes['root.core']!.modules[0]!.rules, 'off');
  });

  it("name a files module's test module by its dotted name", () => {
    const files = loadConfigData(
      parse(`
root:
  modules:
    f: { files: a.ts, test: { modules: { u: { files: '*.test.ts' } } } }
rulesets:
  default: { extends: [warp:recommended], on: { root.f.u: off } }
`),
      { builtins },
    ).config;
    assert.equal(files.archetypes.root!.modules.find((module) => module.name === 'f.u')!.rules, 'off');
  });

  it('refuse an unknown name, listing the ones there are', () => {
    assert.throws(() => load(`${base}  edit: {}\n`, 'pr'), /no ruleset called pr\. Rulesets: default, edit/);
    assert.throws(() => load(undefined, 'pr'), /no ruleset called pr\. The config declares none/);
  });

  it('refuse what is not a ruleset, an unknown base, a loop and a target the config does not have', () => {
    assert.deepEqual(
      failures(`
  default:
    extends: [shared, edit]
    on: { stranger: {}, leaf.lib: {} }
    only: {}
  edit: { extends: [default] }
  plain: [on]
`),
      [
        'rulesets.default: unknown key only; a ruleset takes extends, rules, test, on',
        'rulesets.plain: expected a ruleset, { extends: [warp:recommended], rules: {...} }',
        "rulesets.default.extends: 'shared' is no ruleset; extend warp:recommended, default, edit",
        'rulesets.edit.extends: default extends edit extends default, a loop',
        'rulesets.default.on.stranger: no archetype or module called stranger; name an archetype, or archetype.module',
        'rulesets.default.on.leaf.lib: no archetype or module called leaf.lib; name an archetype, or archetype.module',
      ],
    );
    assert.deepEqual(failures('  - default'), [
      'rulesets: expected rulesets by name, { default: { extends: [warp:recommended] } }',
    ]);
  });

  it('refuse a rule warp does not have, and a setting that is not on, off or options', () => {
    assert.deepEqual(failures('  default: { rules: { no-such-rule: on, no-cycle: 3 } }'), [
      'rulesets.default.rules: no rule called no-such-rule',
      'rulesets.default.rules.no-cycle: expected on, off or options',
    ]);
  });

  it('knows when no rule is on anywhere', () => {
    assert.equal(anyRuleOn(load(undefined)), false);
    assert.equal(anyRuleOn(load('  default:\n    rules: { module-cycle: false }\n')), false);
    assert.equal(anyRuleOn(load(base)), true);
    assert.equal(anyRuleOn(load('  default: { extends: [warp:recommended] }\n')), true);
    assert.equal(anyRuleOn(load('  default: { extends: [warp:recommended], rules: { module-cycle: off } }\n')), true);
    assert.equal(anyRuleOn(load('  default: { rules: { module-cycle: on } }\n')), true);
    assert.equal(anyRuleOn(load('  default:\n    on: { leaf.src: { module-cycle: true } }\n')), true);
  });
});
