import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import type { Project } from '../model/facts.ts';
import { pluginRules, registry } from './registry.ts';
import type { Finding, ModuleRule, ProjectContext, ProjectRule } from './rule.ts';

const module = {
  file: 'src/a.ts',
  lines: 1,
  imports: [],
  externals: [],
  units: { units: [], links: [] },
  functions: [],
};

const finding = (rule: string, file: string): Finding => ({
  rule,
  key: `${rule}:${file}`,
  file,
  line: 1,
  value: 1,
  message: 'm',
});

describe('pluginRules', () => {
  it("names each rule and its findings' keys under the plugin's namespace, for either scope", () => {
    const perModule: ModuleRule = { id: 'per-module', check: ({ module }) => [finding('per-module', module.file)] };
    const whole: ProjectRule = {
      id: 'whole',
      scope: 'project',
      check: ({ project }) => project.modules.map((m) => finding('whole', m.file)),
    };
    const [a, b] = pluginRules({ mine: { rules: [perModule, whole] } });
    assert.deepEqual([a!.id, b!.id, b!.scope], ['mine/per-module', 'mine/whole', 'project']);
    assert.deepEqual((a as ModuleRule).check({ module, options: {} }), [
      { ...finding('per-module', 'src/a.ts'), rule: 'mine/per-module', key: 'mine/per-module:src/a.ts' },
    ]);
    const project: Project = { modules: [module] };
    assert.deepEqual((b as ProjectRule).check({ project } as ProjectContext<object>), [
      { ...finding('whole', 'src/a.ts'), rule: 'mine/whole', key: 'mine/whole:src/a.ts' },
    ]);
  });

  it('refuses a malformed plugin, rule or namespace', () => {
    const at = 'config.plugins';
    const refused = (plugins: Record<string, unknown>) => {
      try {
        pluginRules(plugins);
        return undefined;
      } catch (error) {
        return (error as Error).message;
      }
    };
    assert.equal(refused({ Mine: { rules: [] } }), `${at}.Mine: a namespace is lowercase letters, digits and dashes`);
    assert.equal(
      refused({ mine: {} }),
      `${at}.mine: expected a plugin, { rules: Rule[] }, imported in a warp.config.ts`,
    );
    assert.equal(
      refused({ mine: null }),
      `${at}.mine: expected a plugin, { rules: Rule[] }, imported in a warp.config.ts`,
    );
    assert.equal(
      refused({ mine: { rules: [{ id: 'Bad', check: () => [] }] } }),
      `${at}.mine.rules[0]: a rule id is lowercase letters, digits and dashes`,
    );
    assert.equal(
      refused({ mine: { rules: [null] } }),
      `${at}.mine.rules[0]: a rule id is lowercase letters, digits and dashes`,
    );
    assert.equal(refused({ mine: { rules: [{ id: 'r' }] } }), `${at}.mine.rules[0]: r has no check function`);
    assert.equal(
      refused({ mine: { rules: [{ id: 'r', scope: 'unit', check: () => [] }] } }),
      `${at}.mine.rules[0]: r has scope unit; a scope is module or project`,
    );
    assert.deepEqual(
      pluginRules({ mine: { rules: [{ id: 'r', scope: 'module', check: () => [] }] } }).map((rule) => rule.id),
      ['mine/r'],
    );
  });
});

describe('registry', () => {
  it('refuses two rules with one id', () => {
    assert.throws(() => registry([{ id: 'a' }, { id: 'a' }]), /rules: two rules have the id a/);
    assert.deepEqual([...registry([{ id: 'a' }, { id: 'b' }]).keys()], ['a', 'b']);
  });
});
