import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { ConfigError } from '../rule.ts';
import { type AnyArchetype, archetype, pkg } from './builder.ts';
import { loadConfigData } from './load.ts';
import { type Folders, globRegex, type Model, resolveModel, specificity } from './resolve.ts';

const folders = (paths: readonly string[]): Folders => {
  const children = new Map<string, Set<string>>();
  for (const path of paths) {
    const segments = path.split('/');
    for (let at = 1; at < segments.length; at += 1) {
      const parent = segments.slice(0, at - 1).join('/');
      children.set(parent, (children.get(parent) ?? new Set()).add(segments[at - 1]!));
    }
  }
  return {
    folders: (folder) => [...(children.get(folder) ?? [])].sort(),
    exists: (path) => paths.includes(path) || children.has(path),
  };
};

const resolve = (root: AnyArchetype, files: readonly string[], extra: readonly string[] = []): Model =>
  resolveModel(loadConfigData({ root }).config, folders([...files, ...extra]), files);

const errors = (root: AnyArchetype, files: readonly string[]): string[] => {
  try {
    resolve(root, files);
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.message.split('\n');
  }
  assert.fail('expected a ConfigError');
};

const tree = (model: Model): string[] =>
  model.units.map(
    (unit) =>
      `${unit.id} ${unit.part ?? '-'} ${unit.archetype ?? 'plain'}: ${JSON.stringify(unit.archetype ? unit.parts : unit.ownFiles)}`,
  );

describe('resolveModel', () => {
  it("places the project's files in the root unit's files parts", () => {
    const model = resolve(
      archetype('app').contains((p) => p.files('main', 'main.ts').files('rest', '**')),
      ['main.ts', 'src/a.ts', 'src/b/c.ts'],
    );
    assert.equal(model.root.id, '.');
    assert.equal(model.root.dir, '');
    assert.equal(model.root.archetype, 'app');
    assert.ok(!('part' in model.root));
    assert.ok(!('parent' in model.root));
    assert.deepEqual(model.root.captures, {});
    assert.deepEqual(model.root.parts, { main: ['main.ts'], rest: ['src/a.ts', 'src/b/c.ts'] });
    assert.deepEqual(model.root.ownFiles, ['main.ts', 'src/a.ts', 'src/b/c.ts']);
    assert.equal(model.partOf('src/b/c.ts'), 'rest');
    assert.equal(model.unitOf('main.ts'), model.root);
    assert.equal(model.unitOf('elsewhere.ts'), undefined);
    assert.equal(model.partOf('elsewhere.ts'), undefined);
  });

  it('finds a plain folder for a dir part without an archetype, holding everything under it', () => {
    const model = resolve(
      archetype('app').contains((p) => p.dir('domain', 'src/domain').files('rest', '**')),
      ['src/domain/order.ts', 'src/domain/deep/price.ts', 'src/main.ts'],
    );
    assert.deepEqual(tree(model), [
      '. - app: {"rest":["src/main.ts"]}',
      'src/domain domain plain: ["src/domain/deep/price.ts","src/domain/order.ts"]',
    ]);
    const [domain] = model.root.children;
    assert.equal(domain?.parent, model.root);
    assert.equal(model.unitOf('src/domain/deep/price.ts'), domain);
    assert.equal(model.partOf('src/domain/order.ts'), undefined);
    assert.deepEqual(domain?.looseFiles, []);
    assert.ok(!('archetype' in domain!));
  });

  it('finds a unit per folder a placeholder matches, each with its own captures, down a recursive archetype', () => {
    const component = archetype('component')
      .identify({ marker: '{name}.dom.ts' })
      .contains((p, { self }) =>
        p
          .dir('subcomponent', '{name}', self)
          .files('logic', '*.ts')
          .files('dom', '{name}.dom.ts')
          .files('test', '*.test.ts'),
      );
    const ui = archetype('ui').contains((p) => p.dir('strings', 'strings').dir('components', '{name}', component));
    const root = archetype('app').contains((p) => p.dir('ui', 'src/ui', ui));
    const model = resolve(root, [
      'src/ui/strings/en.ts',
      'src/ui/project/project.dom.ts',
      'src/ui/project/project.test.ts',
      'src/ui/project/graph/graph.dom.ts',
      'src/ui/project/graph/graph.ts',
      'src/ui/project/graph/layout.ts',
      'src/ui/project/graph/card/card.dom.ts',
    ]);
    assert.deepEqual(tree(model), [
      '. - app: {}',
      'src/ui ui ui: {}',
      'src/ui/project ui.components component: {"dom":["src/ui/project/project.dom.ts"],"test":["src/ui/project/project.test.ts"]}',
      'src/ui/project/graph ui.components.subcomponent component: {"logic":["src/ui/project/graph/graph.ts","src/ui/project/graph/layout.ts"],"dom":["src/ui/project/graph/graph.dom.ts"]}',
      'src/ui/project/graph/card ui.components.subcomponent.subcomponent component: {"dom":["src/ui/project/graph/card/card.dom.ts"]}',
      'src/ui/strings ui.strings plain: ["src/ui/strings/en.ts"]',
    ]);
    assert.deepEqual(
      model.units.map((unit) => unit.captures),
      [{}, {}, { name: 'project' }, { name: 'graph' }, { name: 'card' }, {}],
    );
    assert.deepEqual(
      model.unitOf('src/ui/project/graph/card/card.dom.ts')?.parent?.parent?.children.map((unit) => unit.id),
      ['src/ui/project/graph'],
    );
  });

  it('takes a folder only when it holds the marker, which may be outside the program', () => {
    const widget = archetype('widget')
      .identify({ marker: '{name}.json' })
      .contains((p) => p.files('src', '**'));
    const root = archetype('app').contains((p) => p.dir('widgets', 'src/{name}', widget));
    const model = resolve(root, ['src/a/a.ts', 'src/b/b.ts', 'src/c/c.ts'], ['src/a/a.json', 'src/c/a.json']);
    assert.deepEqual(
      model.units.map((unit) => unit.id),
      ['.', 'src/a'],
    );
    assert.deepEqual(model.root.looseFiles, ['src/b/b.ts', 'src/c/c.ts']);
  });

  it("takes a folder when identify's match does, with the captures it adds and the chain above", () => {
    const seen: [string, string[]][] = [];
    const feature = archetype('feature')
      .identify({
        match: (folder, chain) => {
          seen.push([folder, (chain as { id: string }[]).map((unit) => unit.id)]);
          return folder.endsWith('-feature') ? { slug: folder.split('/').pop()! } : false;
        },
      })
      .contains((p) => p.files('src', '**'));
    const root = archetype('app').contains((p) =>
      p.dir(
        'area',
        'src/area',
        archetype('area').contains((q) => q.dir('features', '{name}', feature)),
      ),
    );
    const model = resolve(root, ['src/area/a-feature/x.ts', 'src/area/other/y.ts']);
    assert.deepEqual(seen, [
      ['src/area/a-feature', ['.', 'src/area']],
      ['src/area/other', ['.', 'src/area']],
    ]);
    assert.deepEqual(model.unitOf('src/area/a-feature/x.ts')?.captures, { name: 'a-feature', slug: 'a-feature' });
    assert.deepEqual(model.unitOf('src/area/other/y.ts')?.looseFiles, ['src/area/other/y.ts']);
  });

  it('gives a folder to the most specific dir part: a literal segment beats a placeholder', () => {
    const root = archetype('app').contains((p) =>
      p.dir('anywhere', '{area}/{name}').dir('components', 'src/{name}').dir('strings', 'src/strings'),
    );
    const model = resolve(root, ['src/strings/en.ts', 'src/card/card.ts', 'lib/x/x.ts']);
    assert.deepEqual(
      model.units.map((unit) => [unit.id, unit.part]),
      [
        ['.', undefined],
        ['lib/x', 'anywhere'],
        ['src/card', 'components'],
        ['src/strings', 'strings'],
      ],
    );
  });

  it('lets one dir part match a folder through two of its paths', () => {
    const root = archetype('app').contains((p) => p.dir('code', ['src/a', 'src/{name}']));
    assert.deepEqual(
      resolve(root, ['src/a/x.ts', 'src/b/y.ts']).units.map((unit) => [unit.id, unit.part, unit.captures]),
      [
        ['.', undefined, {}],
        ['src/a', 'code', {}],
        ['src/b', 'code', { name: 'b' }],
      ],
    );
  });

  it('refuses dir parts that claim a folder equally specifically', () => {
    const root = archetype('app').contains((p) => p.dir('a', 'src/{name}').dir('b', ['lib', 'src/{id}']));
    assert.deepEqual(errors(root, ['src/x/x.ts', 'lib/y.ts']), [
      "src/x: app's dir parts a ('src/{name}') and b ('src/{id}') are equally specific; narrow one of the paths",
    ]);
  });

  it('refuses a folder that two units claim from different levels', () => {
    const inner = archetype('inner').contains((p) => p.dir('deep', 'deep'));
    const root = archetype('app').contains((p) => p.dir('outer', 'src', inner).dir('direct', 'src/deep'));
    assert.deepEqual(errors(root, ['src/deep/x.ts']), [
      'src/deep: found as a unit of direct and of outer.deep; one folder is one unit',
    ]);
  });

  it('places a file in its deepest unit, whichever part found it', () => {
    const root = archetype('app').contains((p) => p.dir('src', 'src').dir('domain', 'src/domain'));
    const model = resolve(root, ['src/a.ts', 'src/domain/b.ts']);
    assert.equal(model.unitOf('src/a.ts')?.id, 'src');
    assert.equal(model.unitOf('src/domain/b.ts')?.id, 'src/domain');
    assert.deepEqual(model.unitOf('src/a.ts')?.ownFiles, ['src/a.ts']);
  });

  it('gives a file to the most specific files part, whatever their order', () => {
    const root = archetype('app').contains((p) =>
      p
        .files('rest', '**')
        .files('code', '*.ts')
        .files('tests', '*.test.ts')
        .files('nested', 'src/**')
        .files('main', 'main.ts')
        .files('one', 'src/one.ts'),
    );
    const model = resolve(root, ['main.ts', 'a.ts', 'a.test.ts', 'README.md', 'src/x.ts', 'src/one.ts']);
    assert.deepEqual(model.root.parts, {
      rest: ['README.md'],
      code: ['a.ts'],
      tests: ['a.test.ts'],
      nested: ['src/x.ts'],
      main: ['main.ts'],
      one: ['src/one.ts'],
    });
  });

  it("fills a files pattern's placeholders from the unit's captures", () => {
    const component = archetype('component').contains((p) => p.files('logic', '*.ts').files('dom', '{name}.dom.ts'));
    const root = archetype('app').contains((p) => p.dir('components', '{name}', component));
    const model = resolve(root, ['card/card.dom.ts', 'card/other.dom.ts']);
    assert.deepEqual(model.unitOf('card/card.dom.ts')?.parts, {
      logic: ['card/other.dom.ts'],
      dom: ['card/card.dom.ts'],
    });
  });

  it('refuses files parts that match a file equally specifically, once per file', () => {
    const root = archetype('app').contains((p) => p.files('a', ['*.dsl.ts', 'x.ts']).files('b', 'card.*'));
    assert.deepEqual(resolve(root, ['card.dsl.ts', 'card.ts']).root.parts, { a: ['card.dsl.ts'], b: ['card.ts'] });
    const tied = archetype('app').contains((p) => p.files('a', '*.test.ts').files('b', '**/*.test.ts'));
    assert.deepEqual(errors(tied, ['a.test.ts', 'src/b.test.ts']), [
      "a.test.ts: app's files parts a ('*.test.ts') and b ('**/*.test.ts') are equally specific; narrow one of the patterns",
    ]);
  });

  it('refuses a placeholder that the unit does not capture, in a files pattern or a marker', () => {
    const component = archetype('component')
      .identify({ marker: '{id}.dom.ts' })
      .contains((p) => p.files('dom', '*.dom.ts'));
    const root = archetype('app').contains((p) => p.files('dom', '{name}.dom.ts').dir('c', '{name}', component));
    assert.deepEqual(errors(root, ['a.dom.ts', 'b.dom.ts', 'x/x.dom.ts']), [
      "x: component's marker '{id}.dom.ts' names {id}, which its dir path doesn't capture",
      ".: app.dom '{name}.dom.ts' names {name}, which . doesn't capture",
    ]);
  });

  it('keeps the files no part matches as loose in their unit', () => {
    const quiet = archetype('quiet').contains((p) => p.files('src', '*.ts'));
    const strict = archetype('strict').contains((p) => p.files('src', '*.ts'));
    const root = archetype('app').contains((p) => p.dir('quiet', 'quiet', quiet).dir('strict', 'strict', strict));
    const model = resolve(root, ['stray.ts', 'quiet/a.ts', 'quiet/a.css', 'strict/b.css']);
    assert.deepEqual(
      model.units.map((unit) => [unit.id, unit.looseFiles]),
      [
        ['.', ['stray.ts']],
        ['quiet', ['quiet/a.css']],
        ['strict', ['strict/b.css']],
      ],
    );
    assert.deepEqual(model.unitOf('quiet/a.css')?.ownFiles, ['quiet/a.css', 'quiet/a.ts']);
  });

  it("resolves working title's shape: layers, plain folders, a provided runner and nested components", () => {
    const testRunner = archetype('test-runner').contains((p) => p.files('runner', '**'));
    const layer = archetype('layer')
      .requires({ testRunner })
      .contains((p, { required }) =>
        p.files('src', '**').files('test', '**/*.test.ts', { using: [required.testRunner, pkg('vite-plus/*')] }),
      );
    const root = archetype('working-title')
      .contains((p) =>
        p
          .dir('domain', 'src/domain', layer)
          .dir('ports', 'src/ports', { using: (s) => [s.domain] })
          .dir('testRunner', 'src/test-helpers', testRunner)
          .files('tooling', ['*.ts', 'scripts/**/*.ts']),
      )
      .provides((s) => ({ testRunner: s.testRunner }));
    const model = resolve(root, [
      'vite.config.ts',
      'scripts/build/run.ts',
      'src/domain/project.ts',
      'src/domain/project.test.ts',
      'src/ports/store.ts',
      'src/test-helpers/driver.ts',
    ]);
    assert.deepEqual(tree(model), [
      '. - working-title: {"tooling":["scripts/build/run.ts","vite.config.ts"]}',
      'src/domain domain layer: {"src":["src/domain/project.ts"],"test":["src/domain/project.test.ts"]}',
      'src/ports ports plain: ["src/ports/store.ts"]',
      'src/test-helpers testRunner test-runner: {"runner":["src/test-helpers/driver.ts"]}',
    ]);
  });
});

describe('specificity', () => {
  it('ranks a literal path above any glob, then by the literal suffix, with ** last', () => {
    assert.equal(specificity('main.ts'), Number.POSITIVE_INFINITY);
    assert.equal(specificity('*.test-page.ts'), 13);
    assert.equal(specificity('*.ts'), 3);
    assert.equal(specificity('src/**'), 0);
    assert.equal(specificity('**'), -1);
  });
});

describe('globRegex', () => {
  it('spans folders with **, stays in one with *, and reads everything else literally', () => {
    const matches = (pattern: string, path: string) => globRegex(pattern).test(path);
    assert.ok(matches('**', 'a/b/c.ts'));
    assert.ok(matches('**/*.test.ts', 'a.test.ts'));
    assert.ok(matches('**/*.test.ts', 'a/b/c.test.ts'));
    assert.ok(!matches('**/*.test.ts', 'a/b/c.ts'));
    assert.ok(matches('src/**', 'src/a/b.ts'));
    assert.ok(!matches('src/**', 'lib/a.ts'));
    assert.ok(matches('*.ts', 'a.ts'));
    assert.ok(!matches('*.ts', 'a/b.ts'));
    assert.ok(!matches('*.ts', 'a.tsx'));
    assert.ok(!matches('*.ts', 'xa.ts.map'));
    assert.ok(!matches('a.ts', 'abts'));
    assert.ok(matches('a+(b).ts', 'a+(b).ts'));
    assert.equal(globRegex('*.ts'), globRegex('*.ts'));
  });
});
