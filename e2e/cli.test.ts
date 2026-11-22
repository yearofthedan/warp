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
      [
        'dependency-direction:src/domain/audit.ts->src/app/handle.ts',
        'unit-cycle:src/domain->src/app',
        'unit-cycle:src/app->src/domain',
      ],
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
    assert.match(run.stdout, /3 new findings, 1 worsened, 0 resolved\./);
    assert.match(
      run.stdout,
      /src\/domain\/audit.ts \(src of layer src\/domain\) imports src\/app\/handle.ts \(src of layer src\/app\), which is outside src's reach/,
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
    assert.equal(JSON.parse(run.stdout).added.length, 3);
  });

  it('refuses a malformed range', () => {
    const run = warp('diff', 'HEAD~1..HEAD..HEAD');
    assert.equal(run.status, 2);
    assert.match(run.stderr, /is not a range/);
  });

  it('resolves the project path when reached through a symlink', () => {
    const link = join(mkdtempSync(join(tmpdir(), 'warp-link-')), 'repo');
    symlinkSync(repo, link);
    const config = join(link, 'app/warp.config.ts');
    const run = spawnSync(process.execPath, [cli, 'diff', 'HEAD~1..HEAD', '--reporter', 'json', '--config', config], {
      cwd: project,
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).added.length, 3);
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
    assert.equal(JSON.parse(diffed.stdout).added.length, 10);
    assert.equal(run(['worktree', 'list']).trim().split('\n').length, 1);
  });

  it('leaves no worktrees behind', () => {
    assert.equal(git('worktree', 'list').trim().split('\n').length, 1);
  });
});

describe('warp diff from a linked checkout', () => {
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

  beforeAll(() => {
    const outsideAnyPackageJson = mkdtempSync(join(tmpdir(), 'warp-plugin-'));
    dir = join(outsideAnyPackageJson, 'wt');
    cpSync(join(import.meta.dirname, '../fixtures/custom-rule'), dir, { recursive: true });
    commit('init', '--quiet');
    commit('add', '.');
    commit('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'base');
  });

  it('is found without --config and runs the plugin rule on the parts that turn it on', () => {
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
    writeFileSync(join(project, 'bad.config.ts'), 'export default {};\n');
    const run = warp('check', '--config', 'bad.config.ts');
    assert.equal(run.status, 2);
    assert.match(run.stderr, /warp config: config\.root: expected an archetype/);
  });

  it('exits 1 rather than 2 when a claude-hook run fails, so the hook warns without blocking', () => {
    writeFileSync(join(project, 'bad.config.ts'), 'export default {};\n');
    for (const reporter of ['--reporter=claude-hook', '--reporter claude-hook']) {
      assert.equal(warp('check', '--config', 'bad.config.ts', ...reporter.split(' ')).status, 1);
    }
  });
});

describe('rulesets', () => {
  let dir: string;
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });
  const keys = (findings: { key: string }[]) => findings.map((finding) => finding.key).sort();
  const commit = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });

  beforeAll(() => {
    dir = join(mkdtempSync(join(tmpdir(), 'warp-ruleset-')), 'app');
    cpSync(join(import.meta.dirname, '../fixtures/hexagonal-app'), dir, { recursive: true });
    writeFileSync(
      join(dir, 'warp.config.ts'),
      readFileSync(join(dir, 'warp.config.ts'), 'utf8')
        .replace('export default', 'const plain =')
        .replace(
          'const base = ruleset().rules({',
          "const base = ruleset().on(hexagon.app, { 'cognitive-complexity': false }).rules({",
        )
        .concat(
          'const edit = ruleset()\n',
          '  .extends(base)\n',
          "  .rules({ 'module-cohesion': { maxLines: 10 } })\n",
          "  .on(hexagon.app, { 'cognitive-complexity': true, 'function-cohesion': false });\n",
          "const stray = ruleset().on(archetype('stranger'), { 'no-cycle': false });\n",
          'export default defineConfig({ ...plain, rulesets: { default: base, edit, stray } });\n',
        ),
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
    const cachesTheBaseFirst = run('diff', 'HEAD', '--reporter', 'json');
    assert.deepEqual(JSON.parse(cachesTheBaseFirst.stdout).added, []);
    const delta = JSON.parse(run('diff', 'HEAD', '--ruleset', 'edit', '--reporter', 'json').stdout);
    assert.deepEqual([delta.added, delta.worsened, delta.resolved], [[], [], []]);
  });

  it('shows the rules each part resolves to under the ruleset', () => {
    const { units } = JSON.parse(run('model', '--ruleset', 'edit', '--json').stdout);
    const rules = (id: string) => units.find((unit: { id: string }) => unit.id === id).rules.parts.src;
    assert.deepEqual(rules('src/app')['module-cohesion'], { maxLines: 10 });
    assert.deepEqual(rules('src/app')['cognitive-complexity'], { max: 4 });
    assert.equal(rules('src/app')['function-cohesion'], false);
    assert.deepEqual(rules('src/domain')['function-cohesion'], { maxLines: 6 });
    assert.match(
      run('model', '--ruleset', 'edit', '--rules').stdout,
      /src\/app {2}app: layer {2}src: 2\n {4}rules in unit: function-cohesion off\n/,
    );
  });

  it('lists the rulesets when the name is unknown', () => {
    const checked = run('check', '--ruleset', 'pr');
    assert.equal(checked.status, 2);
    assert.match(checked.stderr, /no ruleset called pr\. Rulesets: default, edit, stray/);
  });

  it('refuses a ruleset that names an archetype outside the config', () => {
    const checked = run('check', '--ruleset', 'stray');
    assert.equal(checked.status, 2);
    assert.match(checked.stderr, /warp config: rulesets\.stray\.on\(stranger\): stranger is not in the config/);
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
        '  loose: src/stray.ts',
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

  it('reports loose files and imports and packages outside their reach, passing a barrel on a surface', () => {
    const checked = run('check', '--reporter', 'json', '--fail');
    assert.equal(checked.status, 1, checked.stderr);
    const { findings } = JSON.parse(checked.stdout);
    assert.deepEqual(
      findings.map((finding: { key: string }) => finding.key),
      [
        'unclassified:src/stray.ts',
        'dependency-direction:src/ui/card/card.ts->src/domain/order.ts',
        'unit-externals:src/ui/card/card.ts->node:util',
      ],
    );
    assert.match(findings[2].docs, /src\/model\/rules\/unit-externals\/README\.md$/);
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

  it("checks a ruleset's rule ids and each rule's options against the rules the config runs", () => {
    writeFileSync(
      join(dir, 'rules.config.ts'),
      [
        "import { archetype, defineConfig } from 'warp';",
        "import { ruleset } from 'warp';",
        "const app = archetype('app').contains((p) => p.files('src', '**'));",
        "const base = ruleset().rules({ 'unit-cycle': { types: 'always' } }).on(app.src, { 'no-such-rule': false });",
        'export default defineConfig({ root: app, rulesets: { default: base } });',
        '',
      ].join('\n'),
    );
    const checked = run('check', '--config', 'rules.config.ts');
    assert.equal(checked.status, 2);
    assert.equal(
      checked.stderr,
      "warp config: rulesets.default.rules.unit-cycle.types: expected 'count' or 'ignore'\nrulesets.default.on(app.src): no rule called no-such-rule\n",
    );
  });
});
