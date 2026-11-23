import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { builtinRegistry } from '../../builtins/index.ts';
import { ConfigError } from '../configError.ts';
import { archetype, dir, files, ruleset } from './builder.ts';
import { loadConfigData } from '../../app/load.ts';

const leaf = archetype('leaf').contains((m) => m.module('src', files('*.ts')).module('test', files('*.test.ts')));
const root = archetype('root').contains((m) => m.module('leaves', dir('{name}'), leaf));
const builtins = [...builtinRegistry.values()];

const base = ruleset()
  .rules({ 'cognitive-complexity': { max: 15 }, 'module-cycle': false })
  .on(leaf, { 'file-cohesion': { maxLines: 300 } })
  .on(leaf.modules.test, 'off');

const load = (rulesets: Record<string, unknown> | undefined, name?: string) =>
  loadConfigData({ root, ...(rulesets ? { rulesets } : {}) }, { builtins, ...(name ? { ruleset: name } : {}) }).config;

const failures = (rulesets: Record<string, unknown>, name?: string): string[] => {
  try {
    load(rulesets, name);
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.message.split('\n');
  }
  assert.fail('expected a ConfigError');
};

describe('rulesets', () => {
  it('apply the default ruleset at each level its lines name: global, an archetype, a module', () => {
    const config = load({ default: base });
    assert.deepEqual(config.rules, { 'cognitive-complexity': { max: 15 }, 'module-cycle': false });
    assert.deepEqual(config.archetypes.leaf!.rules, { 'file-cohesion': { maxLines: 300 } });
    assert.deepEqual(
      config.archetypes.leaf!.modules.map((module) => module.rules),
      [undefined, 'off'],
    );
    assert.equal(config.archetypes.root!.rules, undefined);
  });

  it('leave every level unset with no default, and apply a named one only when asked', () => {
    const config = load({ edit: base });
    assert.equal(config.rules, undefined);
    assert.equal(config.archetypes.leaf!.rules, undefined);
    assert.deepEqual(load({ edit: base }, 'edit').archetypes.leaf!.rules, { 'file-cohesion': { maxLines: 300 } });
    assert.equal(load(undefined).rules, undefined);
  });

  it('merge an extending ruleset after its base: options into options, false off, true on with the options kept', () => {
    const edit = ruleset()
      .extends(base)
      .rules({ 'cognitive-complexity': { max: 12 }, 'module-cycle': true, 'no-cycle': false })
      .rules({ 'cognitive-complexity': true, 'file-cohesion': { maxLines: 100 } })
      .on(leaf, { 'file-cohesion': false })
      .on(leaf.modules.test, { 'no-cycle': true })
      .on(root.modules.leaves, 'off');
    const config = load({ default: base, edit }, 'edit');
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

  it('extend a base the config does not list', () => {
    const shared = ruleset().rules({ 'no-cycle': false });
    assert.deepEqual(load({ default: ruleset().extends(shared) }).rules, { 'no-cycle': false });
  });

  it('refuse an unknown name, listing the ones there are', () => {
    assert.throws(() => load({ default: base, edit: base }, 'pr'), /no ruleset called pr\. Rulesets: default, edit/);
    assert.throws(() => load(undefined, 'pr'), /no ruleset called pr\. The config declares none/);
  });

  it('refuse what is not a ruleset, and a target that is not an archetype or one of its modules', () => {
    const stranger = archetype('stranger').contains((m) => m.module('src', files('**')));
    const odd = ruleset()
      .extends({} as never)
      .on('leaf' as never, {})
      .on(stranger, {})
      .on(stranger.modules.src, {});
    assert.deepEqual(failures({ default: odd, plain: { rules: {} } }), [
      'config.rulesets.plain: expected a ruleset, ruleset().rules(...)',
      'rulesets.default.extends: expected a ruleset',
      'rulesets.default.on: expected an archetype or one of its modules, such as component or component.modules.logic',
      'rulesets.default.on(stranger): stranger is not in the config',
      'rulesets.default.on(stranger.modules.src): stranger is not in the config',
    ]);
    assert.deepEqual(failures([] as never), ['config.rulesets: expected rulesets by name, { default: base, edit }']);
  });

  it('refuse a module the archetype does not have', () => {
    const renamed = archetype('leaf').contains((m) => m.module('lib', files('*.ts')));
    assert.deepEqual(failures({ default: ruleset().on(renamed.modules.lib, {}) }), [
      'rulesets.default.on(leaf.modules.lib): leaf has modules src, test',
    ]);
  });

  it('take one base', () => {
    assert.throws(() => ruleset().extends(base).extends(base), /a ruleset extends one base/);
  });
});

describe('module handles', () => {
  it('are typed after the modules, under modules, so a module may take any name', () => {
    // @ts-expect-error no module called lib
    assert.equal(leaf.modules.lib, undefined);
    const named = archetype('named').contains((m) => m.module('exposes', files('*.ts')));
    assert.equal(typeof named.exposes, 'function');
    assert.equal(typeof named.modules.exposes, 'object');
    assert.doesNotThrow(() => loadConfigData({ root: named }));
  });

  it('nest through an inline contains, and name the module in a ruleset by the path to it', () => {
    const app = archetype('app').contains((m) =>
      m.module(
        'core',
        dir('core'),
        archetype().contains((q) => q.module('ports', files('ports.ts'))),
      ),
    );
    // @ts-expect-error no module called adapters inside core
    assert.equal(app.modules.core.modules.adapters, undefined);
    const config = loadConfigData(
      { root: app, rulesets: { default: ruleset().on(app.modules.core.modules.ports, 'off') } },
      { builtins },
    ).config;
    assert.equal(config.archetypes['app.core']!.modules[0]!.rules, 'off');
    const stray = archetype('stray').contains((m) =>
      m.module(
        'core',
        dir('core'),
        archetype().contains((q) => q.module('ports', files('ports.ts'))),
      ),
    );
    assert.deepEqual(failures({ default: ruleset().on(stray.modules.core.modules.ports, {}) }), [
      'rulesets.default.on(stray.modules.core.modules.ports): stray.core is not in the config',
    ]);
  });
});
