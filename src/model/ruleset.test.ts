import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parseConfig } from './config.ts';
import { mergeRuleset } from './ruleset.ts';
import { ConfigError } from './rule.ts';
import { builtinRegistry } from '../builtins.ts';

const parse = (raw: unknown) => parseConfig(raw, builtinRegistry);

describe('mergeRuleset', () => {
  const base = {
    exclude: ['**/*.test.ts'],
    rules: { 'cognitive-complexity': { max: 15 }, 'module-cohesion': { maxLines: 200 }, 'function-cohesion': false },
    kinds: {
      domain: { match: 'src/domain/**' },
      adapter: { match: 'src/adapters/**', dependsOn: ['domain'], rules: { 'module-cohesion': { maxLines: 300 } } },
    },
  };

  it('returns the base alone unchanged', () => {
    assert.deepEqual(mergeRuleset([base], 'ruleset pr'), base);
  });

  it('merges top-level rules by id: options merge, false turns off, true turns on keeping options', () => {
    const merged = mergeRuleset(
      [base, { rules: { 'cognitive-complexity': { max: 12 }, 'module-cohesion': false } }, { rules: { 'function-cohesion': true, 'cognitive-complexity': true } }],
      'ruleset edit',
    );
    assert.deepEqual(merged.rules, { 'cognitive-complexity': { max: 12 }, 'module-cohesion': false, 'function-cohesion': true });
    assert.deepEqual(merged.kinds, base.kinds);
    assert.deepEqual(merged.exclude, base.exclude);
  });

  it("keeps a rule's options while an overlay turns it off, so a later true brings them back", () => {
    const merged = mergeRuleset(
      [
        base,
        { rules: { 'cognitive-complexity': false }, kinds: { adapter: { rules: { 'module-cohesion': false } } } },
        { rules: { 'cognitive-complexity': true }, kinds: { adapter: { rules: { 'module-cohesion': true } } } },
      ],
      'r',
    );
    assert.deepEqual((merged.rules as Record<string, unknown>)['cognitive-complexity'], { max: 15 });
    assert.deepEqual((merged.kinds as typeof base.kinds).adapter.rules, { 'module-cohesion': { maxLines: 300 } });
  });

  it("merges a kind's rules by kind name, keeping its globs, dependencies and the kinds' order", () => {
    const merged = mergeRuleset([base, { kinds: { adapter: { rules: { 'module-cohesion': { maxLines: 250 }, 'cognitive-complexity': false } } } }], 'r');
    assert.deepEqual(merged.kinds, {
      domain: base.kinds.domain,
      adapter: { match: 'src/adapters/**', dependsOn: ['domain'], rules: { 'module-cohesion': { maxLines: 250 }, 'cognitive-complexity': false } },
    });
    const config = parse(merged);
    assert.deepEqual(config.kinds.map((kind) => kind.name), ['domain', 'adapter']);
    assert.deepEqual(config.kinds[1].rules.map((enabled) => enabled.rule.id), ['dependency-direction', 'no-cross-kind-reexport', 'module-cohesion']);
  });

  it('never changes the base it was given', () => {
    const before = structuredClone(base);
    mergeRuleset([base, { rules: { 'cognitive-complexity': { max: 1 } }, kinds: { adapter: { rules: { 'module-cohesion': false } } } }], 'r');
    assert.deepEqual(base, before);
  });

  it('refuses an overlay that changes anything but rules', () => {
    const refuses = (overlay: unknown, message: RegExp) => assert.throws(() => mergeRuleset([base, overlay], 'ruleset edit'), (error: Error) => error instanceof ConfigError && message.test(error.message));
    refuses({ exclude: ['src/**'] }, /^ruleset edit\[1\]: a ruleset overlay sets rules only, not exclude/);
    refuses({ plugins: {} }, /\[1\]: a ruleset overlay sets rules only, not plugins/);
    refuses({ kinds: { domain: { match: 'src/**' } } }, /\[1\]\.kinds\.domain: a ruleset overlay sets rules only, not match/);
    refuses({ kinds: { domain: { rules: {}, dependsOn: ['adapter'] } } }, /\.kinds\.domain: a ruleset overlay sets rules only, not dependsOn/);
    refuses({ kinds: { ui: { rules: {} } } }, /\[1\]\.kinds: no kind called ui in the base config/);
  });

  it('refuses a ruleset that is not a list', () => {
    assert.throws(() => mergeRuleset(base, 'ruleset edit'), /ruleset edit: expected a ruleset, \[config, \.\.\.overlays\]/);
    assert.throws(() => mergeRuleset([], 'ruleset edit'), /expected a ruleset/);
  });
});
