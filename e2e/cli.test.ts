import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, it } from 'vite-plus/test';

const cli = join(import.meta.dirname, '../src/cli.ts');
let repo: string;
let project: string;

const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
const warp = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: project, encoding: 'utf8' });

/** A repo whose project sits in a subdirectory, with one commit of the hexagonal-app fixture and then a change. */
beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'warp-test-'));
  project = join(repo, 'app');
  cpSync(join(import.meta.dirname, '../fixtures/hexagonal-app'), project, { recursive: true });
  git('init', '--quiet');
  git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'base');

  const handle = join(project, 'src/app/handle.ts');
  writeFileSync(
    handle,
    readFileSync(handle, 'utf8').replace("return 'B';", "if (strict) return 'B-';\n    return 'B';"),
  );
  writeFileSync(
    join(project, 'src/domain/audit.ts'),
    "import { handle } from '../app/handle.ts';\n\nexport const audit = handle;\n",
  );
});

describe('warp diff', () => {
  it('reports only new and worsened findings against the working tree', () => {
    const run = warp('diff', 'HEAD', '--reporter', 'json');
    assert.equal(run.status, 0, run.stderr);
    const delta = JSON.parse(run.stdout);
    assert.deepEqual(
      delta.added.map((f: { key: string }) => f.key),
      ['dependency-direction:src/domain/audit.ts->src/app/handle.ts'],
    );
    assert.deepEqual(
      delta.worsened.map((f: { key: string; was: number; value: number }) => [f.key, f.was, f.value]),
      [['cognitive-complexity:src/app/handle.ts:grade', 10, 12]],
    );
  });

  it('compares two commits', () => {
    git('add', '.');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'head');
    const run = warp('diff', 'HEAD~1..HEAD', '--fail');
    assert.equal(run.status, 1);
    assert.match(run.stdout, /1 new finding, 1 worsened, 0 resolved\./);
    assert.match(
      run.stdout,
      /Domain module src\/domain\/audit.ts imports app src\/app\/handle.ts\. This breaks the dependency direction, so the domain should depend on a port it owns for what it needs \(handle\)/,
    );
  });

  it('prints a hook response only when there is a delta', () => {
    const changed = JSON.parse(warp('diff', 'HEAD~1..HEAD', '--reporter', 'claude-hook').stdout);
    assert.equal(changed.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(changed.hookSpecificOutput.additionalContext, /new: src\/domain\/audit.ts:1/);
    assert.equal(warp('diff', 'HEAD', '--reporter', 'claude-hook').stdout, '');
  });

  it('compares from the merge base with three dots', () => {
    const run = warp('diff', 'HEAD~1...HEAD', '--reporter', 'json');
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).added.length, 1);
  });

  it('refuses a malformed range', () => {
    const run = warp('diff', 'HEAD~1..HEAD..HEAD');
    assert.equal(run.status, 2);
    assert.match(run.stderr, /is not a range/);
  });

  it('resolves the project path when reached through a symlink', () => {
    const link = join(mkdtempSync(join(tmpdir(), 'warp-link-')), 'repo');
    symlinkSync(repo, link);
    const config = join(link, 'app/warp.config.json');
    const run = spawnSync(process.execPath, [cli, 'diff', 'HEAD~1..HEAD', '--reporter', 'json', '--config', config], {
      cwd: project,
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).added.length, 1);
  });

  it('counts a base from before the project existed as having no findings', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'warp-fresh-'));
    const run = (args: string[], cwd = fresh) => execFileSync('git', args, { cwd, encoding: 'utf8' });
    run(['init', '--quiet']);
    writeFileSync(join(fresh, 'README.md'), 'before\n');
    run(['add', '.']);
    run(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'before']);
    cpSync(join(import.meta.dirname, '../fixtures/hexagonal-app'), join(fresh, 'app'), { recursive: true });
    run(['add', '.']);
    run(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'add app']);
    const diffed = spawnSync(process.execPath, [cli, 'diff', 'HEAD~1..HEAD', '--reporter', 'json'], {
      cwd: join(fresh, 'app'),
      encoding: 'utf8',
    });
    assert.equal(diffed.status, 0, diffed.stderr);
    assert.equal(JSON.parse(diffed.stdout).added.length, 8);
    assert.equal(run(['worktree', 'list']).trim().split('\n').length, 1);
  });

  it('leaves no worktrees behind', () => {
    assert.equal(git('worktree', 'list').trim().split('\n').length, 1);
  });
});

describe('warp diff from a linked checkout', () => {
  // A copy of warp itself, as a global `pnpm link` runs it, so a test can edit a built-in rule.
  let tool: string;
  let dir: string;
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [join(tool, 'src/cli.ts'), ...args], { cwd: dir, encoding: 'utf8' });
  const cached = () => readdirSync(join(dir, '../.git/warp-cache'));

  beforeAll(() => {
    tool = mkdtempSync(join(tmpdir(), 'warp-tool-'));
    const own = join(import.meta.dirname, '..');
    cpSync(join(own, 'src'), join(tool, 'src'), { recursive: true });
    cpSync(join(own, 'package.json'), join(tool, 'package.json'));
    symlinkSync(join(own, 'node_modules'), join(tool, 'node_modules'));

    const repo = mkdtempSync(join(tmpdir(), 'warp-linked-'));
    dir = join(repo, 'app');
    cpSync(join(import.meta.dirname, '../fixtures/hexagonal-app'), dir, { recursive: true });
    execFileSync('git', ['init', '--quiet'], { cwd: repo });
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'base'], {
      cwd: repo,
    });
  });

  it('redoes a cached base when a built-in rule changes, and drops the old entry', () => {
    assert.deepEqual(JSON.parse(run('diff', 'HEAD', '--reporter', 'json').stdout).added, []);
    const [first] = cached();
    const rule = join(tool, 'src/model/rules/cognitive-complexity/cognitiveComplexity.ts');
    writeFileSync(
      rule,
      readFileSync(rule, 'utf8').replace(
        'key: `cognitive-complexity:${module.file}:${name}`',
        'key: `cognitive-complexity:${module.file}#${name}`',
      ),
    );
    const delta = JSON.parse(run('diff', 'HEAD', '--reporter', 'json').stdout);
    assert.deepEqual([delta.added, delta.resolved], [[], []]);
    assert.equal(cached().length, 1);
    assert.notEqual(cached()[0], first);
  });
});

describe('a warp.config.ts with a plugin', () => {
  let dir: string;
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });
  const commit = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });

  // Outside any package.json, as a project without "type": "module" would be, and without warp installed.
  beforeAll(() => {
    dir = join(mkdtempSync(join(tmpdir(), 'warp-plugin-')), 'wt');
    cpSync(join(import.meta.dirname, '../fixtures/custom-rule'), dir, { recursive: true });
    commit('init', '--quiet');
    commit('add', '.');
    commit('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'base');
  });

  it('is found without --config and runs the plugin rule on the kinds that turn it on', () => {
    const checked = run('check', '--reporter', 'json');
    assert.equal(checked.status, 0, checked.stderr);
    assert.deepEqual(JSON.parse(checked.stdout).findings, [
      {
        rule: 'wt/no-ports-through-application',
        key: 'wt/no-ports-through-application:src/ui/orderForm.ts->src/application/ports/orderStore.ts',
        file: 'src/ui/orderForm.ts',
        line: 1,
        value: 1,
        message:
          'src/ui/orderForm.ts reaches the port src/application/ports/orderStore.ts through src/application/index.ts. Call a use case instead of holding the port.',
        docs: 'https://example.com/rules/no-ports-through-application',
      },
    ]);
  });

  it("redoes a cached base when the plugin's code changes", () => {
    assert.deepEqual(JSON.parse(run('diff', 'HEAD', '--reporter', 'json').stdout).added, []);
    const rule = join(dir, 'rules/noPortsThroughApplication.ts');
    writeFileSync(rule, readFileSync(rule, 'utf8').replace('${module.file}->${edge.to}', '${module.file}=>${edge.to}'));
    const delta = JSON.parse(run('diff', 'HEAD', '--reporter', 'json').stdout);
    assert.deepEqual([delta.added, delta.resolved], [[], []]);
  });

  it('reports a config without a default export', () => {
    writeFileSync(join(dir, 'empty.config.ts'), 'export const config = {};\n');
    const checked = run('check', '--config', 'empty.config.ts');
    assert.equal(checked.status, 2);
    assert.match(checked.stderr, /warp config: .*empty.config.ts: expected the config as its default export/);
  });
});

describe('warp check', () => {
  it('exits 1 with --fail when there are findings', () => {
    assert.equal(warp('check', '--fail').status, 1);
  });

  it('refuses an unknown reporter', () => {
    const run = warp('check', '--reporter', 'xml');
    assert.equal(run.status, 2);
    assert.match(run.stderr, /no reporter called xml/);
  });

  it('reports a config error', () => {
    writeFileSync(join(project, 'bad.json'), '{"kinds": {"a": {"match": "src/**", "dependsOn": ["b"]}}}');
    const run = warp('check', '--config', 'bad.json');
    assert.equal(run.status, 2);
    assert.match(run.stderr, /warp config: kinds.a.dependsOn: no kind called b/);
  });

  it('exits 1 rather than 2 when a claude-hook run fails, so the hook warns without blocking', () => {
    writeFileSync(join(project, 'bad.json'), '{"kinds": {}}');
    for (const reporter of ['--reporter=claude-hook', '--reporter claude-hook']) {
      assert.equal(warp('check', '--config', 'bad.json', ...reporter.split(' ')).status, 1);
    }
  });
});

describe('rulesets', () => {
  let dir: string;
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });
  const keys = (findings: { key: string }[]) => findings.map((finding) => finding.key).sort();
  const commit = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });

  // The hexagonal-app fixture with its config as a TS default export, minus cognitive complexity on app modules, and an
  // `edit` ruleset that turns it back on there.
  beforeAll(() => {
    dir = join(mkdtempSync(join(tmpdir(), 'warp-ruleset-')), 'app');
    cpSync(join(import.meta.dirname, '../fixtures/hexagonal-app'), dir, { recursive: true });
    const base = JSON.parse(readFileSync(join(dir, 'warp.config.json'), 'utf8'));
    base.kinds.app.rules = { 'cognitive-complexity': false };
    writeFileSync(
      join(dir, 'warp.config.ts'),
      `const base = ${JSON.stringify(base)};\nexport default base;\n` +
        'export const edit = [base, { rules: { "module-cohesion": { maxLines: 10 } } }, ' +
        '{ kinds: { app: { rules: { "cognitive-complexity": true, "function-cohesion": false } } } }];\n' +
        "export const moved = [base, { kinds: { domain: { rules: {}, dependsOn: ['adapter'] } } }];\n" +
        'export const helper = 1;\n',
    );
    writeFileSync(join(dir, 'package.json'), '{ "type": "module" }\n');
    commit('init', '--quiet');
    commit('add', '.');
    commit('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'base');
  });

  it('checks with the ruleset merged onto its base', () => {
    const base = JSON.parse(run('check', '--reporter', 'json').stdout).findings;
    const edit = JSON.parse(run('check', '--ruleset', 'edit', '--reporter', 'json').stdout).findings;
    const only = (findings: { key: string }[], others: { key: string }[]) =>
      keys(findings).filter((key) => !keys(others).includes(key));
    assert.deepEqual(only(base, edit), ['function-cohesion:src/app/handle.ts:handle']);
    assert.deepEqual(only(edit, base), ['cognitive-complexity:src/app/handle.ts:grade']);
  });

  it('diffs both sides with the same ruleset, so a rule it turns on adds no findings by itself', () => {
    // The default run caches the base first, so a ruleset that reused its entry would report grade's complexity as new.
    assert.deepEqual(JSON.parse(run('diff', 'HEAD', '--reporter', 'json').stdout).added, []);
    const delta = JSON.parse(run('diff', 'HEAD', '--ruleset', 'edit', '--reporter', 'json').stdout);
    assert.deepEqual([delta.added, delta.worsened, delta.resolved], [[], [], []]);
  });

  it('prints the resolved config', () => {
    const printed = JSON.parse(run('--print-config', '--ruleset', 'edit').stdout);
    assert.deepEqual(printed.kinds.app.rules['module-cohesion'], { maxLines: 10 });
    assert.deepEqual(printed.kinds.app.rules['cognitive-complexity'], { max: 4 });
    assert.equal(printed.kinds.app.rules['function-cohesion'], undefined);
    assert.deepEqual(printed.kinds.domain.rules['function-cohesion'], { maxLines: 6 });
  });

  it('lists the rulesets when the name is unknown', () => {
    const checked = run('check', '--ruleset', 'pr');
    assert.equal(checked.status, 2);
    assert.match(checked.stderr, /no ruleset called pr\. Rulesets: edit, moved/);
  });

  it('refuses an overlay that changes the architecture', () => {
    const checked = run('check', '--ruleset', 'moved');
    assert.equal(checked.status, 2);
    assert.match(
      checked.stderr,
      /warp config: ruleset moved\[1\]\.kinds\.domain: a ruleset overlay sets rules only, not dependsOn/,
    );
  });

  it('refuses a ruleset for a JSON config', () => {
    const checked = run('check', '--config', 'warp.config.json', '--ruleset', 'edit');
    assert.equal(checked.status, 2);
    assert.match(checked.stderr, /a JSON config has no rulesets/);
  });
});

describe('a warp.config.ts with archetypes', () => {
  let dir: string;
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });
  const commit = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });

  beforeAll(() => {
    dir = join(mkdtempSync(join(tmpdir(), 'warp-archetypes-')), 'app');
    cpSync(join(import.meta.dirname, '../fixtures/archetypes'), dir, { recursive: true });
    commit('init', '--quiet');
    commit('add', '.');
    commit('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'base');
  });

  it('prints the units it finds, with the files of both tsconfigs in their parts', () => {
    const modelled = run('model');
    assert.equal(modelled.status, 0, modelled.stderr);
    assert.equal(
      modelled.stdout,
      [
        '.  root: app  main: 1',
        '  loose (deny): src/stray.ts',
        '  src/domain  domain: layer  src: 1, index: 1, test: 1',
        '  src/ui  ui: ui  no files',
        '    src/ui/card  ui.components: component {name=card}  logic: 1, dom: 1',
        '    src/ui/strings  ui.strings: plain folder  1 files',
        '',
        '5 units, 8 files, 1 loose.',
        '',
      ].join('\n'),
    );
    const { units } = JSON.parse(run('model', '--json').stdout);
    assert.deepEqual(units[1].parts, {
      src: ['src/domain/order.ts'],
      index: ['src/domain/index.ts'],
      test: ['src/domain/order.test.ts'],
    });
  });

  it('reports loose files and imports outside their reach, passing a barrel on a surface', () => {
    const checked = run('check', '--reporter', 'json', '--fail');
    assert.equal(checked.status, 1, checked.stderr);
    const { findings } = JSON.parse(checked.stdout);
    assert.deepEqual(
      findings.map((finding: { key: string }) => finding.key),
      ['unclassified:src/stray.ts', 'dependency-direction:src/ui/card/card.ts->src/domain/order.ts'],
    );
    assert.equal(
      findings[1].message,
      'src/ui/card/card.ts (logic of component src/ui/card) imports src/domain/order.ts (src of layer src/domain), which src/domain keeps private (it exposes api). Import what src/domain exposes, or expose src/domain/order.ts from layer if other units should reach it.',
    );
    assert.match(findings[1].docs, /src\/model\/rules\/dependency-direction\/README\.md$/);
  });

  it('reports only the loose files and imports a change adds', () => {
    writeFileSync(join(dir, 'src/loose.ts'), 'export const loose = 1;\n');
    writeFileSync(
      join(dir, 'src/domain/order.test.ts'),
      "import { order } from './order.ts';\nimport { main } from '../main.ts';\n\nexport const checksTotal = (): boolean => order(1).total === 1 && main() !== '';\n",
    );
    const delta = JSON.parse(run('diff', 'HEAD', '--reporter', 'json').stdout);
    assert.deepEqual(
      delta.added.map((finding: { key: string }) => finding.key),
      ['unclassified:src/loose.ts', 'dependency-direction:src/domain/order.test.ts->src/main.ts'],
    );
  });

  it('names the problem when the config cannot place a file', () => {
    writeFileSync(
      join(dir, 'tied.config.ts'),
      [
        "import { archetype, defineConfig } from 'warp';",
        "export default defineConfig({ root: archetype('app').contains((p) => p.files('a', 'src/*.ts').files('b', '**/*.ts')) });",
        '',
      ].join('\n'),
    );
    const modelled = run('model', '--config', 'tied.config.ts');
    assert.equal(modelled.status, 2);
    assert.match(modelled.stderr, /src\/main\.ts: app's files parts a \('src\/\*\.ts'\) and b \('\*\*\/\*\.ts'\)/);
  });

  it("checks rule ids and each rule's options against the rules an archetype config runs", () => {
    writeFileSync(
      join(dir, 'rules.config.ts'),
      [
        "import { archetype, defineConfig } from 'warp';",
        "const app = archetype('app').contains((p) => p.files('src', '**', { rules: { 'no-such-rule': false } }));",
        "export default defineConfig({ root: app, rules: { 'unit-cycle': { types: 'always' } } });",
        '',
      ].join('\n'),
    );
    const checked = run('check', '--config', 'rules.config.ts');
    assert.equal(checked.status, 2);
    assert.equal(
      checked.stderr,
      "warp config: app.src.rules: no rule called no-such-rule\nconfig.rules.unit-cycle.types: expected 'count' or 'ignore'\n",
    );
  });

  it('keeps --print-config and warp model to the config shape each reads', () => {
    assert.match(run('--print-config').stderr, /warp model shows what an archetype config finds/);
    const kinds = join(import.meta.dirname, '../fixtures/hexagonal-app/warp.config.json');
    const modelled = run('model', '--config', kinds);
    assert.equal(modelled.status, 2);
    assert.match(modelled.stderr, /warp model reads an archetype config/);
  });
});
