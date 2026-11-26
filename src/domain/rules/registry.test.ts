import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import type { Project } from '../facts/facts.ts';
import { pluginRules, registry } from './registry.ts';
import type { Finding, FileRule, ProjectContext, ProjectRule } from './rule.ts';

const file = {
  path: 'src/a.ts',
  lines: 1,
  imports: [],
  externals: [],
  unresolved: [],
  members: { members: [], links: [] },
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
    const perFile: FileRule = { id: 'per-file', check: ({ file }) => [finding('per-file', file.path)] };
    const whole: ProjectRule = {
      id: 'whole',
      scope: 'project',
      check: ({ project }) => project.files.map((m) => finding('whole', m.path)),
    };
    const [a, b] = pluginRules({ mine: { rules: [perFile, whole] } });
    assert.deepEqual([a!.id, b!.id, b!.scope], ['mine/per-file', 'mine/whole', 'project']);
    assert.deepEqual((a as FileRule).check({ file, options: {} }), [
      { ...finding('per-file', 'src/a.ts'), rule: 'mine/per-file', key: 'mine/per-file:src/a.ts' },
    ]);
    const project: Project = { files: [file] };
    assert.deepEqual((b as ProjectRule).check({ project } as ProjectContext<object>), [
      { ...finding('whole', 'src/a.ts'), rule: 'mine/whole', key: 'mine/whole:src/a.ts' },
    ]);
  });

  it('refuses a malformed plugin, rule or namespace', () => {
    const at = 'plugins';
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
      `${at}.mine: expected a plugin, { rules: Rule[] }, as the default export of its file`,
    );
    assert.equal(
      refused({ mine: null }),
      `${at}.mine: expected a plugin, { rules: Rule[] }, as the default export of its file`,
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
      refused({ mine: { rules: [{ id: 'r', scope: 'module', check: () => [] }] } }),
      `${at}.mine.rules[0]: r has scope module; a scope is file or project`,
    );
    assert.deepEqual(
      pluginRules({ mine: { rules: [{ id: 'r', scope: 'file', check: () => [] }] } }).map((rule) => rule.id),
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
