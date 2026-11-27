import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import type { FileFacts, ImportEdge, Project } from '../domain/facts/facts.ts';
import { builtinRules, warp } from '../builtins/index.ts';
import { checkModel } from './checkModel.ts';
import { loadConfigData } from './load.ts';
import { type Folders, resolveModel } from '../domain/model/resolve.ts';
import { rulesOf, settings } from '../domain/model/settings.ts';

const folders = (paths: readonly string[]): Folders => {
  const dirs = new Set(
    paths.flatMap((path) =>
      path
        .split('/')
        .slice(0, -1)
        .map((_, at, all) => all.slice(0, at + 1).join('/')),
    ),
  );
  return {
    folders: (folder) =>
      [...dirs]
        .filter((path) => path.slice(0, path.lastIndexOf('/') + 1) === (folder === '' ? '' : `${folder}/`))
        .map((path) => path.slice(path.lastIndexOf('/') + 1))
        .sort(),
    exists: (path) => paths.includes(path) || dirs.has(path),
  };
};

type Import = string | [to: string, extra: Partial<ImportEdge>];

const edge = (from: string, to: string, extra: Partial<ImportEdge> = {}): ImportEdge => ({
  from,
  to,
  specifier: `./${to}`,
  names: ['x'],
  typeOnly: false,
  line: 2,
  ...extra,
});

const project = (imports: Record<string, readonly Import[]>): Project => ({
  files: Object.entries(imports).map(([file, targets]) => ({
    path: file,
    lines: 10,
    imports: targets.map((target) => {
      const [to, extra] = typeof target === 'string' ? [target, {}] : target;
      return edge(file, to, extra);
    }),
    externals: [],
    unresolved: [],
    members: { members: [], links: [] },
    functions: [],
    classes: [],
  })),
});

const recommended = { extends: ['warp:recommended'] };

const anyOptions = { ...warp, rules: warp.rules.map((rule) => ({ ...rule, parseOptions: () => ({}) })) };

const modelOf = (structure: string, imports: Record<string, readonly Import[]>) => {
  const raw = parse(structure);
  const { config } = loadConfigData({ ...raw, root: { ruleset: recommended, ...raw.root } }, { builtins: anyOptions });
  const paths = Object.keys(imports);
  return { config, model: resolveModel(config, folders(paths), paths), project: project(imports) };
};

const check = (structure: string, imports: Record<string, readonly Import[]>) => {
  const { config, model, project } = modelOf(structure, imports);
  return checkModel(config, model, project, builtinRules);
};

const keys = (findings: readonly { key: string }[]) => findings.map((finding) => finding.key);

describe('rule settings', () => {
  const ruleTree = () => {
    const root = `
root:
  ruleset: { extends: [warp:recommended], rules: { no-cycle: { types: count, z: 3 }, module-cycle: off } }
  modules:
    mid: { dir: mid, archetype: mid, ruleset: { rules: { dependency-direction: { y: 2 } } } }
    top: { files: '*.ts' }
archetypes:
  mid:
    ruleset: { rules: { dependency-direction: { x: 1 } } }
    modules:
      leaves: { dir: '*', archetype: leaf, ruleset: { rules: { no-cycle: off, module-cycle: on } } }
      plain: { dir: plain, ruleset: { rules: { dependency-direction: off } } }
      own: { files: '*.ts' }
  leaf:
    ruleset: { rules: { no-cycle: { types: ignore, depth: 2 }, module-cycle: off } }
    modules:
      quiet: { files: quiet.ts, ruleset: { rules: off } }
      loud: { files: loud.ts, ruleset: { rules: { '*': off, no-cycle: { types: count } } } }
      rest: { files: '*.ts' }
`;
    const paths = ['top.ts', 'mid/own.ts', 'mid/plain/p.ts', 'mid/a/quiet.ts', 'mid/a/loud.ts', 'mid/a/rest.ts'];
    const { config, model } = modelOf(root, Object.fromEntries(paths.map((file) => [file, []])));
    const rules = settings(config, model);
    const module = (id: string) => model.modules.find((candidate) => candidate.id === id)!;
    return { config, model, rules, module };
  };

  it("turns every rule off in a files module with 'off', and '*': off turns off every rule not listed beside it", () => {
    const { rules } = ruleTree();
    assert.equal(rules.atFile('mid/a/quiet.ts', 'no-cycle').on, false);
    assert.equal(rules.atFile('mid/a/quiet.ts', 'dependency-direction').on, false);
    assert.deepEqual(rules.atFile('mid/a/loud.ts', 'no-cycle'), {
      on: true,
      options: { types: 'count', z: 3, depth: 2 },
    });
    assert.equal(rules.atFile('mid/a/loud.ts', 'dependency-direction').on, false);
  });

  it('cascades from the root down: each module takes its archetype, then its own ruleset, onto what is above', () => {
    const { rules } = ruleTree();
    assert.equal(rules.atFile('mid/a/rest.ts', 'no-cycle').on, false);
    assert.deepEqual(rules.atFile('mid/a/rest.ts', 'dependency-direction'), { on: true, options: { x: 1, y: 2 } });
    assert.equal(rules.atFile('mid/plain/p.ts', 'dependency-direction').on, false);
    assert.equal(rules.atFile('mid/own.ts', 'dependency-direction').on, true);
  });

  it("resets nothing: off and '*': off are settings, and a module below turns a rule back on with its options", () => {
    const { config, model } = modelOf(
      `
root:
  ruleset: { rules: { no-cycle: { types: count }, file-cohesion: { maxLines: 50 } } }
  modules:
    legacy:
      dir: legacy
      ruleset: { rules: { '*': off } }
      modules:
        kept: { dir: kept, ruleset: { rules: { no-cycle: on } } }
    paused: { dir: paused, ruleset: { rules: { no-cycle: off } }, modules: { back: { dir: back, ruleset: { rules: { no-cycle: on } } } } }
`,
      { 'legacy/a.ts': [], 'legacy/kept/a.ts': [], 'paused/back/a.ts': [] },
    );
    const rules = settings(config, model);
    assert.equal(rules.atFile('legacy/a.ts', 'no-cycle').on, false);
    assert.deepEqual(rules.atFile('legacy/kept/a.ts', 'no-cycle'), { on: true, options: { types: 'count' } });
    assert.equal(rules.atFile('legacy/kept/a.ts', 'file-cohesion').on, false);
    assert.deepEqual(rules.atFile('paused/back/a.ts', 'no-cycle'), { on: true, options: { types: 'count' } });
  });

  it('settles a module the same way as its files', () => {
    const { rules, module } = ruleTree();
    assert.equal(rules.atModule(module('mid/a'), 'module-cycle').on, true);
    assert.equal(rules.atModule(module('mid'), 'module-cycle').on, false);
    assert.equal(rules.atModule(module('mid/plain'), 'no-cycle').on, true);
  });

  it("lays the settings over the rule's defaults, and leaves a file outside the model with nothing on", () => {
    const { rules } = ruleTree();
    assert.deepEqual(rules.atFile('top.ts', 'no-cycle', { types: 'ignore', w: 4 }), {
      on: true,
      options: { types: 'count', w: 4, z: 3 },
    });
    assert.deepEqual(rules.atFile('top.ts', 'file-cohesion', { maxLines: 300 }), {
      on: true,
      options: { maxLines: 300 },
    });
    assert.equal(rules.atFile('elsewhere.ts', 'no-cycle').on, false);
  });

  it("resolves every rule for each module, a rule that's off as false", () => {
    const { config, model, rules, module } = ruleTree();
    const resolved = rulesOf(config, model, [
      { id: 'no-cycle', defaults: { types: 'ignore' } },
      { id: 'module-cycle' },
    ]);
    assert.deepEqual(resolved.defaults, { 'no-cycle': { types: 'ignore' }, 'module-cycle': {} });
    assert.deepEqual(resolved.module(module('mid/a')), { 'no-cycle': false, 'module-cycle': {} });
    assert.deepEqual(resolved.module(module('mid/a:loud')), {
      'no-cycle': { types: 'count', z: 3, depth: 2 },
      'module-cycle': false,
    });
    assert.deepEqual(rules.atModule(module('mid/a:quiet'), 'no-cycle').on, false);
  });

  it('silences the findings located where a rule is off', () => {
    const findings = check(
      `
root:
  modules:
    domain: { dir: domain }
    generated: { dir: generated, ruleset: { rules: off } }
    main: { files: main.ts, ruleset: { rules: { dependency-direction: off } } }
`,
      {
        'main.ts': ['domain/order.ts'],
        'domain/order.ts': ['generated/api.ts'],
        'generated/api.ts': ['domain/order.ts'],
      },
    );
    assert.deepEqual(keys(findings), [
      'dependency-direction:domain/order.ts->generated/api.ts',
      'no-cycle:domain/order.ts+generated/api.ts',
      'module-cycle:domain+generated',
    ]);
  });
});

describe('placing findings', () => {
  it("names the module of each finding's file, a test module's for a test, and no module for the config", () => {
    const { config } = loadConfigData(
      parse(`
root:
  modules:
    domain: { dir: domain, exposes: all, test: { modules: { tests: { files: '*.test.ts' } } } }
    infra: { dir: infra, dependencies: [domain] }
  ruleset: { extends: [warp:recommended] }
`),
      { builtins: warp },
    );
    const paths = ['domain/order.ts', 'domain/order.test.ts', 'infra/db.ts', 'loose.ts'];
    const model = resolveModel(config, folders(paths), paths);
    const facts = project({
      'domain/order.ts': ['infra/db.ts'],
      'domain/order.test.ts': ['infra/db.ts'],
      'infra/db.ts': [],
      'loose.ts': [],
    });
    assert.deepEqual(
      checkModel(config, model, facts, builtinRules).map((finding) => [finding.file, finding.module]),
      [
        ['loose.ts', '(root)'],
        ['domain/order.ts', 'domain'],
        ['domain/order.test.ts', 'domain:tests'],
        ['warp.yaml', undefined],
        ['warp.yaml', undefined],
      ],
    );
  });
});

describe('code measures', () => {
  const complex = (file: string, total: number): FileFacts => ({
    path: file,
    lines: 10,
    imports: [],
    externals: [],
    unresolved: [],
    members: { members: [], links: [] },
    classes: [],
    functions: [
      {
        name: 'run',
        line: 1,
        endLine: 9,
        lines: 9,
        statements: { members: [], links: [] },
        complexity: { total, increments: [{ line: 2, amount: total, reason: 'if' }] },
      },
    ],
  });
  const measuredApp = () => {
    const app = `
root:
  ruleset: { extends: [warp:recommended], rules: { cognitive-complexity: { max: 20 } } }
  modules:
    scripts: { files: 'scripts/*.ts', ruleset: { rules: { cognitive-complexity: off } } }
    specs: { files: '*.test.ts', ruleset: { rules: { cognitive-complexity: { max: 30 } } } }
    src: { files: '*.ts' }
`;
    return { app };
  };

  it("judges each file's functions against the threshold nearest to it, and not where the rule is off", () => {
    const { app } = measuredApp();
    const measured = [complex('a.ts', 25), complex('b.ts', 18), complex('a.test.ts', 25), complex('scripts/c.ts', 40)];
    const { config, model } = modelOf(app, Object.fromEntries(measured.map((file) => [file.path, []])));
    const findings = checkModel(config, model, { files: measured }, builtinRules);
    assert.deepEqual(
      findings.map((finding) => [finding.key, finding.limit]),
      [['cognitive-complexity:a.ts:run', 20]],
    );
  });

  it("falls back to the rule's defaults", () => {
    const plain = "root: { modules: { src: { files: '*.ts' } } }";
    const measured = [complex('a.ts', 16), complex('b.ts', 15)];
    const { config, model } = modelOf(plain, Object.fromEntries(measured.map((file) => [file.path, []])));
    assert.deepEqual(keys(checkModel(config, model, { files: measured }, builtinRules)), [
      'cognitive-complexity:a.ts:run',
    ]);
  });
});

describe('cycles', () => {
  const loopingApp = () => {
    const app = `
root:
  modules:
    domain: { dir: domain, exposes: all }
    infra: { dir: infra, exposes: all, dependencies: [domain] }
    features: { dir: '*', archetype: feature, dependencies: [domain], ruleset: { rules: { module-cycle: off } } }
    main: { files: main.ts, dependencies: [domain, infra, features] }
archetypes:
  feature:
    requires: [domain]
    exposes: all
    modules:
      src: { files: '**', exposes: all, dependencies: [domain] }
`;
    return { app };
  };

  const imports = {
    'main.ts': ['domain/u.ts'],
    'domain/u.ts': ['main.ts'],
    'domain/c.ts': ['domain/e.ts'],
    'domain/e.ts': ['domain/u.ts'],
    'domain/x.ts': ['infra/y.ts', 'domain/x.ts'],
    'infra/y.ts': ['domain/x.ts'],
    'domain/m.ts': [['infra/w.ts', { typeOnly: true }], 'infra/w.ts', 'infra/v.ts'],
    'infra/v.ts': [],
    'infra/w.ts': [['domain/m.ts', { line: 7 }]],
    'domain/t.ts': [['infra/z.ts', { typeOnly: true }]],
    'infra/z.ts': ['domain/t.ts'],
    'domain/p.ts': ['domain/q.ts'],
    'domain/q.ts': ['domain/r.ts'],
    'domain/r.ts': ['domain/p.ts', 'elsewhere.ts'],
    'a/a.ts': ['b/b.ts'],
    'b/b.ts': ['a/a.ts'],
    'loop/r.ts': ['loop/s.ts', 'loop/p.ts'],
    'loop/s.ts': ['loop/p.ts'],
    'loop/p.ts': ['loop/x.ts'],
    'loop/x.ts': ['loop/q.ts'],
    'loop/q.ts': ['loop/r.ts'],
  } satisfies Record<string, Import[]>;
  const cycles = (rules = '') => {
    const { app } = loopingApp();
    const ruleset = `\n  ruleset: { extends: [warp:recommended], rules: { ${rules} } }`;
    return check(app.replace('root:', `root:${ruleset}`), imports).filter(
      (finding) => finding.rule !== 'dependency-direction',
    );
  };

  it('reports each loop between files once, counting type-only imports and ignoring imports of the file itself', () => {
    assert.deepEqual(
      cycles()
        .filter((finding) => finding.rule === 'no-cycle')
        .map(({ key, value }) => [key, value]),
      [
        ['no-cycle:domain/u.ts+main.ts', 2],
        ['no-cycle:domain/x.ts+infra/y.ts', 2],
        ['no-cycle:domain/m.ts+infra/w.ts', 2],
        ['no-cycle:domain/t.ts+infra/z.ts', 2],
        ['no-cycle:domain/p.ts+domain/q.ts+domain/r.ts', 3],
        ['no-cycle:a/a.ts+b/b.ts', 2],
        ['no-cycle:loop/p.ts+loop/q.ts+loop/r.ts+loop/s.ts+loop/x.ts', 6],
      ],
    );
  });

  it('names every import on a file loop, and each is a site', () => {
    const finding = cycles().find((candidate) => candidate.key === 'no-cycle:domain/m.ts+infra/w.ts');
    assert.deepEqual(finding, {
      rule: 'no-cycle',
      key: 'no-cycle:domain/m.ts+infra/w.ts',
      file: 'domain/m.ts',
      line: 2,
      module: 'domain',
      value: 2,
      message:
        'domain/m.ts and infra/w.ts import each other in a loop: domain/m.ts:2 imports infra/w.ts, infra/w.ts:7 imports domain/m.ts. Break it at one of these imports: move what both need into a file they both import, or invert one import.',
      sites: [
        { file: 'domain/m.ts', line: 2 },
        { file: 'infra/w.ts', line: 7 },
      ],
      parts: ['domain/m.ts->infra/w.ts', 'infra/w.ts->domain/m.ts'],
      details: {
        files: ['domain/m.ts', 'infra/w.ts'],
        edges: [
          edge('domain/m.ts', 'infra/w.ts', { typeOnly: true }),
          edge('domain/m.ts', 'infra/w.ts'),
          edge('infra/w.ts', 'domain/m.ts', { line: 7 }),
        ],
      },
    });
    const three = cycles().find((candidate) => candidate.key.startsWith('no-cycle:domain/p.ts'))!;
    assert.match(three.message, /^domain\/p.ts, domain\/q.ts and domain\/r.ts import each other/);
    const large = cycles().find((candidate) => candidate.key.startsWith('no-cycle:loop/'))!;
    assert.match(
      large.message,
      /^5 files import each other in a loop: loop\/p.ts:2 imports loop\/x.ts, .*, and 1 more\./,
    );
  });

  it('reports each loop between sibling modules once, at its first import, with every crossing import a site', () => {
    const [loop, ...others] = cycles().filter((finding) => finding.rule === 'module-cycle');
    assert.deepEqual(others, []);
    assert.deepEqual(
      [loop!.key, loop!.file, loop!.line, loop!.value],
      ['module-cycle:(root):main+domain+infra', 'domain/m.ts', 2, 9],
    );
    assert.equal(
      loop!.message,
      '(root):main, domain and infra import each other in a loop: (root):main -> domain (main.ts:2 imports domain/u.ts), domain -> (root):main (domain/u.ts:2 imports main.ts), domain -> infra (domain/x.ts:2 imports infra/y.ts, and 3 other imports), infra -> domain (infra/y.ts:2 imports domain/x.ts, and 2 other imports). Break it at one of these imports: move what both sides need into a module they both use, or turn module-cycle off on the module that holds them if they are meant to use each other.',
    );
    assert.deepEqual(loop!.parts, ['(root):main->domain', 'domain->(root):main', 'domain->infra', 'infra->domain']);
    assert.deepEqual(
      loop!.sites!.map(({ file, line }) => `${file}:${line}`),
      [
        'domain/m.ts:2',
        'domain/t.ts:2',
        'domain/u.ts:2',
        'domain/x.ts:2',
        'infra/w.ts:7',
        'infra/y.ts:2',
        'infra/z.ts:2',
        'main.ts:2',
      ],
    );
    const {
      module,
      modules,
      imports: crossing,
    } = loop!.details as {
      module: string;
      modules: string[];
      imports: { from: string; to: string; edges: unknown[] }[];
    };
    assert.deepEqual(
      [module, modules, crossing.map(({ from, to, edges }) => [from, to, edges.length])],
      [
        '(root)',
        ['(root):main', 'domain', 'infra'],
        [
          ['main.ts', 'domain/u.ts', 1],
          ['domain/u.ts', 'main.ts', 1],
          ['domain/x.ts', 'infra/y.ts', 1],
          ['domain/m.ts', 'infra/w.ts', 2],
          ['domain/m.ts', 'infra/v.ts', 1],
          ['domain/t.ts', 'infra/z.ts', 1],
          ['infra/y.ts', 'domain/x.ts', 1],
          ['infra/w.ts', 'domain/m.ts', 1],
          ['infra/z.ts', 'domain/t.ts', 1],
        ],
      ],
    );
  });

  it('leaves out the imports of a file where no-cycle is off, and the loop when all of them are', () => {
    const app = (rules: string, a = '') => `
root:
  ruleset: { rules: { ${rules} } }
  modules: { a: { dir: a, exposes: all${a} }, b: { dir: b } }
`;
    const looping = { 'a/a.ts': ['b/b.ts'], 'b/b.ts': ['a/a.ts'] };
    const [loop] = check(app('no-cycle: on', ', ruleset: { rules: { no-cycle: off } }'), looping);
    assert.deepEqual([loop!.rule, loop!.file, loop!.value, loop!.parts], ['no-cycle', 'b/b.ts', 1, ['b/b.ts->a/a.ts']]);
    assert.deepEqual(check(app('no-cycle: off'), looping), []);
  });

  it('leaves out the imports of a module where the rule is off, and the loop when all of them are', () => {
    const off = 'ruleset: { rules: { module-cycle: off } }';
    const app = (a: string, root = '') =>
      `root: { ${root}modules: { a: { dir: a, exposes: all${a} }, b: { dir: b, exposes: all } } }`;
    const looping = { 'a/a.ts': ['b/b.ts'], 'b/b.ts': ['a/a.ts'] };
    const moduleCycles = (yaml: string) => check(yaml, looping).filter((finding) => finding.rule === 'module-cycle');
    const [loop] = moduleCycles(app(`, ${off}`));
    assert.deepEqual([loop!.file, loop!.value, loop!.sites], ['b/b.ts', 1, [{ file: 'b/b.ts', line: 2 }]]);
    assert.deepEqual(
      moduleCycles(app('', `ruleset: { extends: [warp:recommended], rules: { module-cycle: off } }, `)),
      [],
    );
  });

  it("leaves type-only imports out where types is 'ignore'", () => {
    const ignored = cycles('no-cycle: { types: ignore }, module-cycle: { types: ignore }');
    assert.ok(!keys(ignored).includes('no-cycle:domain/t.ts+infra/z.ts'));
    const loop = ignored.find((finding) => finding.key === 'module-cycle:(root):main+domain+infra')!;
    assert.equal(loop.value, 8);
  });

  it("attaches each rule's docs", () => {
    const { app } = loopingApp();
    const { config, model, project: facts } = modelOf(app, imports);
    const rules = builtinRules.map((rule) => ({ ...rule, docs: `https://${rule.id}` }));
    const docs = checkModel(config, model, facts, rules);
    assert.equal(docs.find((finding) => finding.rule === 'no-cycle')?.docs, 'https://no-cycle');
    assert.equal(docs.find((finding) => finding.rule === 'module-cycle')?.docs, 'https://module-cycle');
    assert.ok(cycles().every((finding) => !('docs' in finding)));
  });
});
