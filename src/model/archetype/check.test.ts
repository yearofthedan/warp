import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import type { ImportEdge, Project } from '../facts.ts';
import { type AnyArchetype, archetype, type Ruleset, ruleset } from './builder.ts';
import { builtinRules } from '../rules/index.ts';
import { checkModel } from './check.ts';
import { loadConfigData } from './load.ts';
import { type Folders, resolveModel } from './resolve.ts';
import { rulesOf, settings } from './settings.ts';

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

const project = (imports: Record<string, readonly Import[]>): Project => ({
  modules: Object.entries(imports).map(([file, targets]) => ({
    file,
    lines: 10,
    imports: targets.map((target) => {
      const [to, extra] = typeof target === 'string' ? [target, {}] : target;
      return { from: file, to, specifier: `./${to}`, names: ['x'], typeOnly: false, line: 2, ...extra };
    }),
    externals: [],
    units: { units: [], links: [] },
    functions: [],
  })),
});

const modelOf = (root: AnyArchetype, imports: Record<string, readonly Import[]>, rules?: Ruleset) => {
  const { config } = loadConfigData({ root, ...(rules === undefined ? {} : { rulesets: { default: rules } }) });
  const files = Object.keys(imports);
  return { config, model: resolveModel(config, folders(files), files), project: project(imports) };
};

const check = (root: AnyArchetype, imports: Record<string, readonly Import[]>, rules?: Ruleset) => {
  const { config, model, project } = modelOf(root, imports, rules);
  return checkModel(config, model, project, builtinRules);
};

const keys = (findings: readonly { key: string }[]) => findings.map((finding) => finding.key);

describe('rule settings', () => {
  const leaf = archetype('leaf').contains((p) =>
    p.files('quiet', 'quiet.ts').files('loud', 'loud.ts').files('rest', '*.ts'),
  );
  const mid = archetype('mid').contains((p) =>
    p.dir('leaves', '{name}', leaf).dir('plain', 'plain').files('own', '*.ts'),
  );
  const root = archetype('root').contains((p) => p.dir('mid', 'mid', mid).files('top', '*.ts'));
  const paths = ['top.ts', 'mid/own.ts', 'mid/plain/p.ts', 'mid/a/quiet.ts', 'mid/a/loud.ts', 'mid/a/rest.ts'];
  const { config, model } = modelOf(
    root,
    Object.fromEntries(paths.map((file) => [file, []])),
    ruleset()
      .rules({ 'no-cycle': { types: 'count', z: 3 }, 'unit-cycle': false })
      .on(leaf, { 'no-cycle': { types: 'ignore', depth: 2 }, 'unit-cycle': false })
      .on(leaf.quiet, 'off')
      .on(leaf.loud, { '*': false, 'no-cycle': { types: 'count' } })
      .on(mid, { 'dependency-direction': { x: 1 } })
      .on(mid.leaves, { 'no-cycle': false, 'unit-cycle': true })
      .on(mid.plain, { 'dependency-direction': false })
      .on(root.mid, { 'dependency-direction': { y: 2 } }),
  );
  const rules = settings(config, model);
  const unit = (id: string) => model.units.find((candidate) => candidate.id === id)!;

  it("turns a rule off in a files part with 'off', and '*': false leaves on only the rules listed beside it", () => {
    assert.equal(rules.atFile('mid/a/quiet.ts', 'no-cycle').on, false);
    assert.equal(rules.atFile('mid/a/quiet.ts', 'dependency-direction').on, false);
    assert.deepEqual(rules.atFile('mid/a/loud.ts', 'no-cycle'), {
      on: true,
      options: { types: 'count', depth: 2, z: 3 },
    });
    assert.equal(rules.atFile('mid/a/loud.ts', 'dependency-direction').on, false);
  });

  it('decides on the nearest level that names the rule: files part, dir part, archetype, then each unit above', () => {
    assert.deepEqual(rules.atFile('mid/a/rest.ts', 'no-cycle'), {
      on: false,
      options: { types: 'ignore', depth: 2, z: 3 },
    });
    assert.deepEqual(rules.atFile('mid/a/rest.ts', 'dependency-direction'), { on: true, options: { x: 1, y: 2 } });
    assert.equal(rules.atFile('mid/plain/p.ts', 'dependency-direction').on, false);
    assert.equal(rules.atFile('mid/own.ts', 'dependency-direction').on, true);
  });

  it("places a unit by its dir part, then its archetype, then its parent's", () => {
    assert.equal(rules.atUnit(unit('mid/a'), 'unit-cycle').on, true);
    assert.equal(rules.atUnit(unit('mid'), 'unit-cycle').on, false);
    assert.equal(rules.atUnit(unit('mid/plain'), 'no-cycle').on, true);
  });

  it("takes the global settings last, then the rule's defaults, and leaves a rule nobody names on", () => {
    assert.deepEqual(rules.atFile('top.ts', 'no-cycle', { types: 'ignore', w: 4 }), {
      on: true,
      options: { types: 'count', w: 4, z: 3 },
    });
    assert.deepEqual(rules.atFile('top.ts', 'module-cohesion', { maxLines: 300 }), {
      on: true,
      options: { maxLines: 300 },
    });
    assert.equal(rules.atFile('elsewhere.ts', 'unit-cycle').on, false);
    assert.deepEqual(rules.atFile('elsewhere.ts', 'no-cycle').options, { types: 'count', z: 3 });
  });

  it("resolves every rule for a unit and for each of its parts, a rule that's off as false", () => {
    const resolved = rulesOf(config, model, [{ id: 'no-cycle', defaults: { types: 'ignore' } }, { id: 'unit-cycle' }]);
    assert.deepEqual(resolved.defaults, { 'no-cycle': { types: 'ignore' }, 'unit-cycle': {} });
    assert.deepEqual(resolved.unit(unit('mid/a')), { 'no-cycle': false, 'unit-cycle': {} });
    assert.deepEqual(resolved.part(unit('mid/a'), 'loud'), {
      'no-cycle': { types: 'count', depth: 2, z: 3 },
      'unit-cycle': false,
    });
    assert.deepEqual(rules.atPart(unit('mid/a'), 'quiet', 'no-cycle').on, false);
  });

  it('silences the findings located where a rule is off', () => {
    const app = archetype('app').contains((p) =>
      p.dir('domain', 'domain').dir('generated', 'generated').files('main', 'main.ts'),
    );
    const findings = check(
      app,
      {
        'main.ts': ['domain/order.ts'],
        'domain/order.ts': ['generated/api.ts'],
        'generated/api.ts': ['domain/order.ts'],
      },
      ruleset().on(app.generated, 'off').on(app.main, { 'dependency-direction': false }),
    );
    assert.deepEqual(keys(findings), [
      'dependency-direction:domain/order.ts->generated/api.ts',
      'no-cycle:domain/order.ts->generated/api.ts',
      'unit-cycle:domain->generated',
    ]);
  });
});

describe('code measures', () => {
  const complex = (file: string, total: number): Project['modules'][number] => ({
    file,
    lines: 10,
    imports: [],
    externals: [],
    units: { units: [], links: [] },
    functions: [
      {
        name: 'run',
        line: 1,
        endLine: 9,
        lines: 9,
        statements: { units: [], links: [] },
        complexity: { total, increments: [{ line: 2, amount: total, reason: 'if' }] },
      },
    ],
  });
  const app = archetype('app').contains((p) =>
    p.files('scripts', 'scripts/*.ts').files('tests', '*.test.ts').files('src', '*.ts'),
  );
  const thresholds = ruleset()
    .on(app, { 'cognitive-complexity': { max: 20 } })
    .on(app.scripts, { 'cognitive-complexity': false })
    .on(app.tests, { 'cognitive-complexity': { max: 30 } });

  it("judges each file's functions against the threshold nearest to it, and not where the rule is off", () => {
    const modules = [complex('a.ts', 25), complex('b.ts', 18), complex('a.test.ts', 25), complex('scripts/c.ts', 40)];
    const { config, model } = modelOf(app, Object.fromEntries(modules.map((module) => [module.file, []])), thresholds);
    const findings = checkModel(config, model, { modules }, builtinRules);
    assert.deepEqual(
      findings.map((finding) => [finding.key, finding.limit]),
      [['cognitive-complexity:a.ts:run', 20]],
    );
  });

  it("falls back to the rule's defaults", () => {
    const plain = archetype('plain').contains((p) => p.files('src', '*.ts'));
    const modules = [complex('a.ts', 16), complex('b.ts', 15)];
    const { config, model } = modelOf(plain, Object.fromEntries(modules.map((module) => [module.file, []])));
    assert.deepEqual(keys(checkModel(config, model, { modules }, builtinRules)), ['cognitive-complexity:a.ts:run']);
  });
});

describe('must-import', () => {
  const runner = archetype('runner')
    .contains((p) => p.files('contract', 'contract.ts').files('rest', '**', { using: (s) => [s.contract] }))
    .exposes((s) => ({ contract: s.contract, rest: s.rest }));
  const feature = archetype('feature')
    .requires({ runner })
    .contains((p, { required }) =>
      p
        .files('logic', '*.ts')
        .files('dsl', '*.dsl.ts', {
          using: (s) => [s.logic, required.runner],
          mustImport: [required.runner.contract],
        })
        .files('test', '*.test.ts', { using: (s) => [s.logic, s.dsl] }),
    );
  const app = archetype('app')
    .contains((p) =>
      p
        .dir('runner', 'runner', runner)
        .dir('features', 'features/{name}', feature)
        .dir('legacy', 'legacy/{name}', feature),
    )
    .provides((s) => ({ runner: s.runner }));
  const legacyOff = ruleset().on(app.legacy, { 'must-import': false });
  const imports = {
    'runner/contract.ts': [],
    'runner/index.ts': [],
    'runner/impl.ts': [],
    'features/a/a.ts': [],
    'features/a/on.dsl.ts': ['runner/contract.ts', 'features/a/a.ts'],
    'features/a/barrel.dsl.ts': [
      ['features/a/a.ts', { via: 'features/a/index.ts' }],
      ['runner/impl.ts', { via: 'runner/contract.ts' }],
    ],
    'features/a/off.dsl.ts': ['runner/index.ts'],
    'legacy/b/off.dsl.ts': [],
  } satisfies Record<string, Import[]>;
  const mustImports = (findings: readonly { rule: string; key: string }[]) =>
    keys(findings.filter((finding) => finding.rule === 'must-import'));

  it('reports each file in the part with no import of the target, through a barrel or not', () => {
    assert.deepEqual(mustImports(check(app, imports, legacyOff)), [
      'must-import:features/a/off.dsl.ts->required.runner.contract',
    ]);
    assert.deepEqual(mustImports(check(app, imports)), [
      'must-import:features/a/off.dsl.ts->required.runner.contract',
      'must-import:legacy/b/off.dsl.ts->required.runner.contract',
    ]);
  });

  it('says which part asks for the import, and how to answer it', () => {
    const [contract] = check(app, imports, legacyOff).filter((finding) => finding.rule === 'must-import');
    assert.deepEqual(contract, {
      rule: 'must-import',
      key: 'must-import:features/a/off.dsl.ts->required.runner.contract',
      file: 'features/a/off.dsl.ts',
      line: 1,
      value: 1,
      message:
        'features/a/off.dsl.ts (dsl of feature features/a) imports nothing from required.runner.contract (from .), which every file in dsl must import. Import what it needs from required.runner.contract (from .), or move the file out of dsl.',
      details: { unit: 'features/a', part: 'dsl', to: 'required.runner.contract (from .)' },
    });
  });

  it('reports each target a file misses, and skips a file outside the program', () => {
    const kid = archetype('kid').contains((p) =>
      p
        .files('api', 'api.ts')
        .files('types', 'types.ts')
        .files('dsl', '*.dsl.ts', { using: (s) => [s.api, s.types], mustImport: (s) => [s.api, s.types] }),
    );
    const {
      config,
      model,
      project: facts,
    } = modelOf(kid, {
      'api.ts': [],
      'types.ts': [],
      'x.dsl.ts': ['types.ts'],
      'y.dsl.ts': [],
    });
    const findings = checkModel(
      config,
      model,
      { modules: facts.modules.filter((m) => m.file !== 'y.dsl.ts') },
      builtinRules,
    );
    assert.deepEqual(mustImports(findings), ['must-import:x.dsl.ts->api']);
  });
});

describe('cycles', () => {
  const app = archetype('app').contains((p) =>
    p
      .dir('domain', 'domain')
      .dir('infra', 'infra', { using: (s) => [s.domain] })
      .dir(
        'features',
        '{name}',
        archetype('feature').contains((q) => q.files('src', '**')),
        { using: (s) => [s.domain] },
      )
      .files('main', 'main.ts', { using: (s) => [s.domain, s.infra, s.features] }),
  );
  const featuresMayLoop = ruleset().on(app.features, { 'unit-cycle': false });
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
  const cycles = (rules = featuresMayLoop) =>
    check(app, imports, rules).filter((finding) => finding.rule !== 'dependency-direction');

  it('reports each edge of a loop between files, ignoring type-only imports and imports of the file itself', () => {
    assert.deepEqual(keys(cycles().filter((finding) => finding.rule === 'no-cycle')), [
      'no-cycle:main.ts->domain/u.ts',
      'no-cycle:domain/u.ts->main.ts',
      'no-cycle:domain/x.ts->infra/y.ts',
      'no-cycle:infra/y.ts->domain/x.ts',
      'no-cycle:domain/m.ts->infra/w.ts',
      'no-cycle:infra/w.ts->domain/m.ts',
      'no-cycle:domain/p.ts->domain/q.ts',
      'no-cycle:domain/q.ts->domain/r.ts',
      'no-cycle:domain/r.ts->domain/p.ts',
      'no-cycle:a/a.ts->b/b.ts',
      'no-cycle:b/b.ts->a/a.ts',
      'no-cycle:loop/r.ts->loop/s.ts',
      'no-cycle:loop/r.ts->loop/p.ts',
      'no-cycle:loop/s.ts->loop/p.ts',
      'no-cycle:loop/p.ts->loop/x.ts',
      'no-cycle:loop/x.ts->loop/q.ts',
      'no-cycle:loop/q.ts->loop/r.ts',
    ]);
  });

  it('shows the shortest loop through the edge, with the imports that make it', () => {
    const finding = cycles().find((candidate) => candidate.key === 'no-cycle:domain/q.ts->domain/r.ts');
    assert.deepEqual(finding, {
      rule: 'no-cycle',
      key: 'no-cycle:domain/q.ts->domain/r.ts',
      file: 'domain/q.ts',
      line: 2,
      value: 1,
      message:
        'domain/q.ts imports domain/r.ts, which leads back to it: domain/q.ts -> domain/r.ts -> domain/p.ts -> domain/q.ts. Break the loop: move what both need into a file they both import, or invert one import.',
      details: {
        loop: ['domain/q.ts', 'domain/r.ts', 'domain/p.ts', 'domain/q.ts'],
        edges: [
          {
            from: 'domain/q.ts',
            to: 'domain/r.ts',
            specifier: './domain/r.ts',
            names: ['x'],
            typeOnly: false,
            line: 2,
          },
        ],
      },
    });
    const diamond = cycles().find((candidate) => candidate.key === 'no-cycle:loop/q.ts->loop/r.ts');
    assert.deepEqual((diamond!.details as { loop: string[] }).loop, [
      'loop/q.ts',
      'loop/r.ts',
      'loop/p.ts',
      'loop/x.ts',
      'loop/q.ts',
    ]);
  });

  it('reports each edge of a loop between sibling units, skipping a unit and its own files', () => {
    const units = cycles().filter((finding) => finding.rule === 'unit-cycle');
    assert.deepEqual(
      units.map(({ key, file, line, value }) => [key, file, line, value]),
      [
        ['unit-cycle:domain->infra', 'domain/m.ts', 2, 3],
        ['unit-cycle:infra->domain', 'infra/w.ts', 7, 3],
      ],
    );
    assert.equal(
      units[0]!.message,
      'domain imports infra (domain/m.ts imports infra/v.ts), and the units of . loop: domain -> infra -> domain. Break the loop: move what both need into a unit they both use, or turn unit-cycle off on the dir part if its units are meant to use each other.',
    );
    const {
      unit,
      loop,
      imports: crossing,
    } = units[0]!.details as {
      unit: string;
      loop: string[];
      imports: { from: string; to: string; edges: unknown[] }[];
    };
    assert.deepEqual(
      [unit, loop, crossing.map(({ from, to, edges }) => [from, to, edges.length])],
      [
        '.',
        ['domain', 'infra', 'domain'],
        [
          ['domain/x.ts', 'infra/y.ts', 1],
          ['domain/m.ts', 'infra/w.ts', 2],
          ['domain/m.ts', 'infra/v.ts', 1],
        ],
      ],
    );
  });

  it("counts type-only imports where types is 'count'", () => {
    const counted = cycles(featuresMayLoop.rules({ 'no-cycle': { types: 'count' }, 'unit-cycle': { types: 'count' } }));
    assert.ok(keys(counted).includes('no-cycle:domain/t.ts->infra/z.ts'));
    const loop = counted.find((finding) => finding.key === 'unit-cycle:domain->infra')!;
    assert.equal(loop.value, 4);
  });

  it("attaches each rule's docs", () => {
    const { config, model, project: facts } = modelOf(app, imports, featuresMayLoop);
    const rules = builtinRules.map((rule) => ({ ...rule, docs: `https://${rule.id}` }));
    const docs = checkModel(config, model, facts, rules);
    assert.equal(docs.find((finding) => finding.rule === 'no-cycle')?.docs, 'https://no-cycle');
    assert.equal(docs.find((finding) => finding.rule === 'unit-cycle')?.docs, 'https://unit-cycle');
    assert.ok(cycles().every((finding) => !('docs' in finding)));
  });
});
