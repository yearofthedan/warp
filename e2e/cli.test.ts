import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
    type Seen = { key: string; file: string; line: number; was: number; value: number };
    assert.deepEqual(
      delta.added.map((f: Seen) => f.key),
      ['dependency-direction:src/domain/audit.ts->src/app/handle.ts'],
    );
    assert.deepEqual(
      delta.worsened.map((f: Seen) => [f.key, `${f.file}:${f.line}`, f.was, f.value]),
      [
        ['module-cycle:src/adapters+src/app+src/domain', 'src/domain/audit.ts:1', 3, 6],
        ['cognitive-complexity:src/app/handle.ts:grade', 'src/app/handle.ts:12', 10, 12],
      ],
    );
  });

  it('compares two commits', () => {
    git('add', '.');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'head');
    const run = warp('diff', 'HEAD~1..HEAD', '--fail');
    assert.equal(run.status, 1);
    assert.match(run.stdout, /1 new finding, 2 worsened, 1 resolved\./);
    assert.match(
      run.stdout,
      /src\/domain\/audit.ts \(root.domain src\/domain\) imports src\/app\/handle.ts \(root.app src\/app\), which is outside domain's reach/,
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
    const config = join(link, 'app/warp.yaml');
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
    assert.equal(JSON.parse(diffed.stdout).added.length, 14);
    assert.equal(run(['worktree', 'list']).trim().split('\n').length, 1);
  });

  it('leaves no worktrees behind', () => {
    assert.equal(git('worktree', 'list').trim().split('\n').length, 1);
  });
});

describe('warp diff --since-last-run', () => {
  let dir: string;
  const commit = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  const added = () =>
    JSON.parse(
      spawnSync(process.execPath, [cli, 'diff', 'HEAD', '--since-last-run', '--reporter', 'json'], {
        cwd: dir,
        encoding: 'utf8',
      }).stdout,
    ).added.map((f: { key: string }) => f.key);
  const write = (file: string, text: string) => writeFileSync(join(dir, file), text);

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'warp-since-'));
    cpSync(join(import.meta.dirname, '../fixtures/hexagonal-app'), dir, { recursive: true });
    commit('init', '--quiet');
    commit('add', '.');
    commit('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'base');
  });

  it('reports each new finding once, at the run after the edit that made it', () => {
    write('src/domain/audit.ts', "import { handle } from '../app/handle.ts';\n\nexport const audit = handle;\n");
    assert.ok(added().includes('dependency-direction:src/domain/audit.ts->src/app/handle.ts'));
    write('src/domain/other.ts', 'export const other = 1;\n');
    assert.deepEqual(added(), []);
  });

  it('starts again from HEAD when HEAD moves, so a pulled finding is not put on the next edit', () => {
    const audit = readFileSync(join(dir, 'src/domain/audit.ts'), 'utf8');
    rmSync(join(dir, 'src/domain/audit.ts'));
    assert.ok(!added().includes('dependency-direction:src/domain/audit.ts->src/app/handle.ts'));
    write('src/domain/audit.ts', audit);
    commit('add', '.');
    commit('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'audit');
    assert.deepEqual(added(), []);
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

  it('redoes a cached base and its facts when a built-in rule changes, and drops the old entries', () => {
    assert.deepEqual(JSON.parse(run('diff', 'HEAD', '--reporter', 'json').stdout).added, []);
    const first = cached();
    assert.equal(first.length, 2);
    const rule = join(tool, 'src/builtins/cognitive-complexity/cognitiveComplexity.ts');
    writeFileSync(
      rule,
      readFileSync(rule, 'utf8').replace(
        'key: `cognitive-complexity:${file.path}:${name}`',
        'key: `cognitive-complexity:${file.path}#${name}`',
      ),
    );
    const delta = JSON.parse(run('diff', 'HEAD', '--reporter', 'json').stdout);
    assert.deepEqual([delta.added, delta.resolved], [[], []]);
    assert.equal(cached().length, 2);
    assert.deepEqual(
      cached().filter((entry) => first.includes(entry)),
      [],
    );
  });
});

describe('a warp.yaml with a plugin', () => {
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

  it('is found without --config and runs the plugin rule on the modules that turn it on', () => {
    const checked = run('check', '--reporter', 'json');
    assert.equal(checked.status, 0, checked.stderr);
    assert.deepEqual(JSON.parse(checked.stdout).findings, [
      {
        rule: 'wt/no-ports-through-application',
        key: 'wt/no-ports-through-application:src/ui/orderForm.ts->src/application/ports/orderStore.ts',
        file: 'src/ui/orderForm.ts',
        line: 1,
        module: '(root):ui',
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
    writeFileSync(rule, readFileSync(rule, 'utf8').replace('${file.path}->${edge.to}', '${file.path}=>${edge.to}'));
    const delta = JSON.parse(run('diff', 'HEAD', '--reporter', 'json').stdout);
    assert.deepEqual([delta.added, delta.resolved], [[], []]);
  });

  it('reports a plugin without a default export', () => {
    writeFileSync(join(dir, 'rules/empty.ts'), 'export const rules = [];\n');
    writeFileSync(
      join(dir, 'empty.yaml'),
      "plugins: { e: ./rules/empty.ts }\nroot: { modules: { src: { files: '**' } } }\n",
    );
    const checked = run('check', '--config', 'empty.yaml');
    assert.equal(checked.status, 2);
    assert.match(checked.stderr, /warp config: .*empty.yaml: plugins\.e: \.\/rules\/empty\.ts has no default export/);
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
    writeFileSync(join(project, 'bad.yaml'), 'root: 3\n');
    const run = warp('check', '--config', 'bad.yaml');
    assert.equal(run.status, 2);
    assert.match(run.stderr, /warp config: root: expected the repository/);
  });

  it('tells Claude once that a claude-hook run failed, then exits 1 so the hook warns without blocking', () => {
    writeFileSync(join(project, 'bad.yaml'), 'root: 3\n');
    writeFileSync(join(project, 'worse.yaml'), 'root: [\n');
    const hook = (config: string) => warp('diff', 'HEAD', '--config', config, '--reporter=claude-hook');
    const context = (run: ReturnType<typeof warp>) => JSON.parse(run.stdout).hookSpecificOutput.additionalContext;

    const first = hook('bad.yaml');
    assert.equal(first.status, 0, first.stderr);
    assert.match(
      context(first),
      /^Warp architecture feedback is unavailable, so edits are not checked: warp config: root: expected the repository/,
    );
    const again = hook('bad.yaml');
    assert.deepEqual([again.status, again.stdout], [1, '']);
    assert.match(context(hook('worse.yaml')), /unavailable.*warp config: .*worse\.yaml:2: /);
    assert.equal(hook('warp.yaml').status, 0);
    assert.match(context(hook('bad.yaml')), /unavailable/);
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
      join(dir, 'warp.yaml'),
      readFileSync(join(dir, 'warp.yaml'), 'utf8')
        .replace(
          '      cognitive-complexity: { max: 4 }\n',
          '      cognitive-complexity: { max: 4 }\n    on: { root.app: { cognitive-complexity: off } }\n',
        )
        .concat(
          '  edit:\n',
          '    extends: [default]\n',
          '    rules: { file-cohesion: { maxLines: 10 } }\n',
          '    on: { root.app: { cognitive-complexity: on, function-cohesion: off } }\n',
          '  stray:\n',
          '    on: { stranger: { no-cycle: off } }\n',
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

  it('shows the rules each module resolves to under the ruleset', () => {
    const { modules } = JSON.parse(run('model', '--ruleset', 'edit', '--json').stdout);
    const rules = (id: string) => modules.find((module: { id: string }) => module.id === id).rules;
    assert.deepEqual(rules('src/app')['file-cohesion'], { maxLines: 10 });
    assert.deepEqual(rules('src/app')['cognitive-complexity'], { max: 4 });
    assert.equal(rules('src/app')['function-cohesion'], false);
    assert.deepEqual(rules('src/domain')['function-cohesion'], { maxLines: 6 });
    assert.match(
      run('model', '--ruleset', 'edit', '--rules').stdout,
      /src\/app {2}app: root\.app, 2 files\n {4}rules: function-cohesion off\n/,
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
    assert.match(checked.stderr, /warp config: rulesets\.stray\.on\.stranger: no archetype or module called stranger/);
  });
});

describe('a warp.yaml with archetypes', () => {
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

  it('prints the modules it finds, with the files of both tsconfigs in their modules', () => {
    const modelled = run('model');
    assert.equal(modelled.status, 0, modelled.stderr);
    assert.equal(
      modelled.stdout,
      [
        '(root)  root: root',
        '  loose: src/stray.ts',
        '  src/domain  domain: layer',
        '    src/domain:src  1 file',
        '    src/domain:api  1 file',
        '    src/domain:tests  1 test file',
        '  src/ui  ui: ui',
        '    src/ui/strings  strings: ui.strings, 1 file',
        '    src/ui/card  components: component {name=card}',
        '      src/ui/card:logic  1 file',
        '      src/ui/card:render  1 file',
        '  (root):main  1 file',
        '',
        '11 modules, 7 files, 1 test file, 1 loose.',
        '',
      ].join('\n'),
    );
    const { modules } = JSON.parse(run('model', '--json').stdout);
    const filesOf = (id: string) => modules.find((module: { id: string }) => module.id === id).files;
    assert.deepEqual(['src/domain:src', 'src/domain:api'].map(filesOf), [
      ['src/domain/order.ts'],
      ['src/domain/index.ts'],
    ]);
    assert.deepEqual(filesOf('src/domain:tests'), ['src/domain/order.test.ts']);
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
        'module-externals:src/ui/card/card.ts->node:util',
        'no-cross-module-reexport:src/domain/index.ts->src/domain/order.ts',
        'unused-declaration:grant:component.render.dependencies->subcomponent.render',
        'unused-declaration:grant:root.ui.dependencies->domain',
        'unused-declaration:empty:component.subcomponent',
      ],
    );
    assert.match(findings[2].docs, /src\/builtins\/module-externals\/README\.md$/);
    assert.equal(
      findings[1].message,
      'src/ui/card/card.ts (logic of component src/ui/card) imports src/domain/order.ts (src of layer src/domain), which src/domain keeps private (it exposes api). No declared path allows this: either the import or the structure is wrong.',
    );
    assert.match(findings[1].docs, /src\/builtins\/dependency-direction\/README\.md$/);
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
      [
        'unclassified:src/loose.ts',
        'dependency-direction:src/domain/order.test.ts->src/main.ts',
        'unused-declaration:grant:root.test.provides->node:*',
      ],
    );
  });

  it('names the problem when the config cannot place a file', () => {
    writeFileSync(join(dir, 'tied.yaml'), "root: { modules: { a: { files: 'src/*.ts' }, b: { files: '**/*.ts' } } }\n");
    const modelled = run('model', '--config', 'tied.yaml');
    assert.equal(modelled.status, 2);
    assert.match(modelled.stderr, /src\/main\.ts: root's files modules a \('src\/\*\.ts'\) and b \('\*\*\/\*\.ts'\)/);
  });

  it("checks a ruleset's rule ids and each rule's options against the rules the config runs", () => {
    writeFileSync(
      join(dir, 'rules.yaml'),
      [
        "root: { modules: { src: { files: '**' } } }",
        'rulesets:',
        '  default:',
        '    extends: [warp:recommended]',
        '    rules: { module-cycle: { types: always } }',
        '    on: { root.src: { no-such-rule: off } }',
        '',
      ].join('\n'),
    );
    const checked = run('check', '--config', 'rules.yaml');
    assert.equal(checked.status, 2);
    assert.equal(
      checked.stderr,
      "warp config: rulesets.default.rules.module-cycle.types: expected 'count' or 'ignore'\nrulesets.default.on.root.src: no rule called no-such-rule\n",
    );
  });
});
