import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { ConfigError } from '../configError.ts';
import { all, type AnyArchetype, archetype, dir, exposes, files, pkg, using } from './builder.ts';
import { loadConfigData } from '../../app/load.ts';
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
  model.modules.map((module) => `${module.id} ${module.archetype ?? 'files'}: ${JSON.stringify(module.files)}`);

describe('resolveModel', () => {
  it("makes each files module a module of its own inside the root, named by the root's folder and its name", () => {
    const model = resolve(
      archetype('app').contains((m) => m.module('main', files('main.ts')).module('rest', files('**'))),
      ['main.ts', 'src/a.ts', 'src/b/c.ts'],
    );
    assert.equal(model.root.id, '(root)');
    assert.equal(model.root.dir, '');
    assert.equal(model.root.kind, 'dir');
    assert.equal(model.root.archetype, 'app');
    assert.ok(!('name' in model.root));
    assert.ok(!('parent' in model.root));
    assert.deepEqual(model.root.captures, {});
    assert.deepEqual(tree(model), [
      '(root) app: []',
      '(root):main files: ["main.ts"]',
      '(root):rest files: ["src/a.ts","src/b/c.ts"]',
    ]);
    const [main, rest] = model.root.children;
    assert.equal(main?.kind, 'files');
    assert.equal(main?.name, 'main');
    assert.equal(main?.parent, model.root);
    assert.equal(model.moduleOf('src/b/c.ts'), rest);
    assert.equal(model.moduleOf('elsewhere.ts'), undefined);
  });

  it('finds a folder module for a dir module, holding everything under it when its archetype declares no modules', () => {
    const model = resolve(
      archetype('app').contains((m) => m.module('domain', dir('src/domain')).module('rest', files('**'))),
      ['src/domain/order.ts', 'src/domain/deep/price.ts', 'src/main.ts'],
    );
    assert.deepEqual(tree(model), [
      '(root) app: []',
      'src/domain app.domain: ["src/domain/deep/price.ts","src/domain/order.ts"]',
      '(root):rest files: ["src/main.ts"]',
    ]);
    const [domain] = model.root.children;
    assert.equal(domain?.parent, model.root);
    assert.equal(domain?.name, 'domain');
    assert.equal(model.moduleOf('src/domain/deep/price.ts'), domain);
    assert.deepEqual(domain?.looseFiles, []);
  });

  it("lists a module's children in declaration order, a dir module's folders in path order", () => {
    const model = resolve(
      archetype('app').contains((m) =>
        m.module('z', files('z.ts')).module('features', dir('{name}')).module('a', files('a.ts')),
      ),
      ['z.ts', 'a.ts', 'b/b.ts', 'a/a.ts'],
    );
    assert.deepEqual(
      model.modules.map((module) => module.id),
      ['(root)', '(root):z', 'a', 'b', '(root):a'],
    );
  });

  it('finds the modules an inline contains declares, under an archetype named for where it sits', () => {
    const root = archetype('app').contains((m) =>
      m.module(
        'app',
        dir('src/app'),
        archetype().contains((q) => q.module('ports', files('ports.ts')).module('core', dir('core'))),
      ),
    );
    const model = resolve(root, ['src/app/ports.ts', 'src/app/core/a.ts', 'src/app/stray.ts']);
    assert.deepEqual(tree(model), [
      '(root) app: []',
      'src/app app.app: ["src/app/stray.ts"]',
      'src/app:ports files: ["src/app/ports.ts"]',
      'src/app/core app.app.core: ["src/app/core/a.ts"]',
    ]);
    assert.deepEqual(model.moduleOf('src/app/stray.ts')?.looseFiles, ['src/app/stray.ts']);
  });

  it('finds a module per folder a placeholder matches, each with its own captures, down a recursive archetype', () => {
    const component = archetype('component')
      .identify({ marker: '{name}.dom.ts' })
      .contains((m, { self }) =>
        m
          .module('subcomponent', dir('{name}'), self)
          .module('logic', files('*.ts'))
          .module('dom', files('{name}.dom.ts'))
          .module('test', files('*.test.ts')),
      );
    const ui = archetype('ui').contains((m) =>
      m.module('strings', dir('strings')).module('components', dir('{name}'), component),
    );
    const root = archetype('app').contains((m) => m.module('ui', dir('src/ui'), ui));
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
      '(root) app: []',
      'src/ui ui: []',
      'src/ui/strings ui.strings: ["src/ui/strings/en.ts"]',
      'src/ui/project component: []',
      'src/ui/project/graph component: []',
      'src/ui/project/graph/card component: []',
      'src/ui/project/graph/card:dom files: ["src/ui/project/graph/card/card.dom.ts"]',
      'src/ui/project/graph:logic files: ["src/ui/project/graph/graph.ts","src/ui/project/graph/layout.ts"]',
      'src/ui/project/graph:dom files: ["src/ui/project/graph/graph.dom.ts"]',
      'src/ui/project:dom files: ["src/ui/project/project.dom.ts"]',
      'src/ui/project:test files: ["src/ui/project/project.test.ts"]',
    ]);
    assert.deepEqual(model.moduleOf('src/ui/project/graph/card/card.dom.ts')?.captures, { name: 'card' });
    assert.deepEqual(
      model
        .moduleOf('src/ui/project/graph/card/card.dom.ts')
        ?.parent?.parent?.parent?.children.map((module) => module.id),
      ['src/ui/project/graph', 'src/ui/project:dom', 'src/ui/project:test'],
    );
  });

  it('takes a folder only when it holds the marker, which may be outside the program', () => {
    const widget = archetype('widget')
      .identify({ marker: '{name}.json' })
      .contains((m) => m.module('src', files('**')));
    const root = archetype('app').contains((m) => m.module('widgets', dir('src/{name}'), widget));
    const model = resolve(root, ['src/a/a.ts', 'src/b/b.ts', 'src/c/c.ts'], ['src/a/a.json', 'src/c/a.json']);
    assert.deepEqual(
      model.modules.map((module) => module.id),
      ['(root)', 'src/a', 'src/a:src'],
    );
    assert.deepEqual(model.root.looseFiles, ['src/b/b.ts', 'src/c/c.ts']);
  });

  it("takes a folder when identify's match does, with the captures it adds and the chain above", () => {
    const seen: [string, string[]][] = [];
    const feature = archetype('feature')
      .identify({
        match: (folder, chain) => {
          seen.push([folder, (chain as { id: string }[]).map((module) => module.id)]);
          return folder.endsWith('-feature') ? { slug: folder.split('/').pop()! } : false;
        },
      })
      .contains((m) => m.module('src', files('**')));
    const root = archetype('app').contains((m) =>
      m.module(
        'area',
        dir('src/area'),
        archetype('area').contains((q) => q.module('features', dir('{name}'), feature)),
      ),
    );
    const model = resolve(root, ['src/area/a-feature/x.ts', 'src/area/other/y.ts']);
    assert.deepEqual(seen, [
      ['src/area/a-feature', ['(root)', 'src/area']],
      ['src/area/other', ['(root)', 'src/area']],
    ]);
    assert.deepEqual(model.moduleOf('src/area/a-feature/x.ts')?.captures, { name: 'a-feature', slug: 'a-feature' });
    assert.deepEqual(model.moduleOf('src/area/other/y.ts')?.looseFiles, ['src/area/other/y.ts']);
  });

  it('gives a folder to the most specific dir module: a literal segment beats a placeholder', () => {
    const root = archetype('app').contains((m) =>
      m
        .module('anywhere', dir('{area}/{name}'))
        .module('components', dir('src/{name}'))
        .module('strings', dir('src/strings')),
    );
    const model = resolve(root, ['src/strings/en.ts', 'src/card/card.ts', 'lib/x/x.ts']);
    assert.deepEqual(
      model.modules.map((module) => [module.id, module.name]),
      [
        ['(root)', undefined],
        ['lib/x', 'anywhere'],
        ['src/card', 'components'],
        ['src/strings', 'strings'],
      ],
    );
  });

  it('lets one dir module match a folder through two of its paths', () => {
    const root = archetype('app').contains((m) => m.module('code', dir('src/a', 'src/{name}')));
    assert.deepEqual(
      resolve(root, ['src/a/x.ts', 'src/b/y.ts']).modules.map((module) => [module.id, module.name, module.captures]),
      [
        ['(root)', undefined, {}],
        ['src/a', 'code', {}],
        ['src/b', 'code', { name: 'b' }],
      ],
    );
  });

  it('refuses dir modules that claim a folder equally specifically', () => {
    const root = archetype('app').contains((m) => m.module('a', dir('src/{name}')).module('b', dir('lib', 'src/{id}')));
    assert.deepEqual(errors(root, ['src/x/x.ts', 'lib/y.ts']), [
      "src/x: app's dir modules a ('src/{name}') and b ('src/{id}') are equally specific; narrow one of the paths",
    ]);
  });

  it('refuses a folder that two modules claim from different levels', () => {
    const inner = archetype('inner').contains((m) => m.module('deep', dir('deep')));
    const root = archetype('app').contains((m) =>
      m.module('outer', dir('src'), inner).module('direct', dir('src/deep')),
    );
    assert.deepEqual(errors(root, ['src/deep/x.ts']), [
      'src/deep: found as a module of direct and of outer.deep; one folder is one module',
    ]);
  });

  it('places a file in its deepest folder module, whichever module found it', () => {
    const root = archetype('app').contains((m) => m.module('src', dir('src')).module('domain', dir('src/domain')));
    const model = resolve(root, ['src/a.ts', 'src/domain/b.ts']);
    assert.equal(model.moduleOf('src/a.ts')?.id, 'src');
    assert.equal(model.moduleOf('src/domain/b.ts')?.id, 'src/domain');
    assert.deepEqual(model.moduleOf('src/a.ts')?.files, ['src/a.ts']);
  });

  it('gives a file to the most specific files module, whatever their order', () => {
    const root = archetype('app').contains((m) =>
      m
        .module('rest', files('**'))
        .module('code', files('*.ts'))
        .module('specs', files('*.test.ts'))
        .module('nested', files('src/**'))
        .module('main', files('main.ts'))
        .module('one', files('src/one.ts')),
    );
    const model = resolve(root, ['main.ts', 'a.ts', 'a.test.ts', 'README.md', 'src/x.ts', 'src/one.ts']);
    assert.deepEqual(tree(model).slice(1), [
      '(root):rest files: ["README.md"]',
      '(root):code files: ["a.ts"]',
      '(root):specs files: ["a.test.ts"]',
      '(root):nested files: ["src/x.ts"]',
      '(root):main files: ["main.ts"]',
      '(root):one files: ["src/one.ts"]',
    ]);
  });

  it("fills a files pattern's placeholders from the module's captures", () => {
    const component = archetype('component').contains((m) =>
      m.module('logic', files('*.ts')).module('dom', files('{name}.dom.ts')),
    );
    const root = archetype('app').contains((m) => m.module('components', dir('{name}'), component));
    const model = resolve(root, ['card/card.dom.ts', 'card/other.dom.ts']);
    assert.equal(model.moduleOf('card/card.dom.ts')?.id, 'card:dom');
    assert.equal(model.moduleOf('card/other.dom.ts')?.id, 'card:logic');
  });

  it('refuses files modules that match a file equally specifically, once per file', () => {
    const root = archetype('app').contains((m) =>
      m.module('a', files('*.dsl.ts', 'x.ts')).module('b', files('card.*')),
    );
    assert.deepEqual(tree(resolve(root, ['card.dsl.ts', 'card.ts'])).slice(1), [
      '(root):a files: ["card.dsl.ts"]',
      '(root):b files: ["card.ts"]',
    ]);
    const tied = archetype('app').contains((m) => m.module('a', files('*.test.ts')).module('b', files('**/*.test.ts')));
    assert.deepEqual(errors(tied, ['a.test.ts', 'src/b.test.ts']), [
      "a.test.ts: app's files modules a ('*.test.ts') and b ('**/*.test.ts') are equally specific; narrow one of the patterns",
    ]);
    const folders = archetype('app').contains((m) =>
      m.module('domain', files('src/domain/**')).module('refs', files('src/domain/refs/**')),
    );
    assert.deepEqual(errors(folders, ['src/domain/refs/a.ts']), [
      "src/domain/refs/a.ts: app's files modules domain ('src/domain/**') and refs ('src/domain/refs/**') are equally specific; declare the folders with dir(), where the deeper folder wins",
    ]);
  });

  it('refuses a placeholder that the module does not capture, in a files pattern or a marker', () => {
    const component = archetype('component')
      .identify({ marker: '{id}.dom.ts' })
      .contains((m) => m.module('dom', files('*.dom.ts')));
    const root = archetype('app').contains((m) =>
      m.module('dom', files('{name}.dom.ts')).module('c', dir('{name}'), component),
    );
    assert.deepEqual(errors(root, ['a.dom.ts', 'b.dom.ts', 'x/x.dom.ts']), [
      "x: component's marker '{id}.dom.ts' names {id}, which its dir path doesn't capture",
      "(root): app.dom '{name}.dom.ts' names {name}, which (root) doesn't capture",
    ]);
  });

  it('keeps the files no module matches as loose in their folder module', () => {
    const quiet = archetype('quiet').contains((m) => m.module('src', files('*.ts')));
    const strict = archetype('strict').contains((m) => m.module('src', files('*.ts')));
    const root = archetype('app').contains((m) =>
      m.module('quiet', dir('quiet'), quiet).module('strict', dir('strict'), strict),
    );
    const model = resolve(root, ['stray.ts', 'quiet/a.ts', 'quiet/a.css', 'strict/b.css']);
    assert.deepEqual(
      model.modules.map((module) => [module.id, module.looseFiles]),
      [
        ['(root)', ['stray.ts']],
        ['quiet', ['quiet/a.css']],
        ['quiet:src', []],
        ['strict', ['strict/b.css']],
      ],
    );
    assert.deepEqual(model.moduleOf('quiet/a.css')?.files, ['quiet/a.css']);
  });

  it("resolves working title's shape: layers, plain folders, a provided runner and nested components", () => {
    const testRunner = archetype('test-runner')
      .contains((m) => m.module('runner', files('**'), exposes(all())))
      .exposes(all());
    const layer = archetype('layer')
      .requires({ testRunner })
      .contains((m, { required }) =>
        m
          .module('src', files('**'))
          .module('test', files('**/*.test.ts'), using([required.testRunner, pkg('vite-plus/*')])),
      );
    const root = archetype('working-title')
      .contains((m) =>
        m
          .module('domain', dir('src/domain'), layer)
          .module('ports', dir('src/ports'))
          .module('testRunner', dir('src/test-helpers'), testRunner)
          .module('tooling', files('*.ts', 'scripts/**/*.ts')),
      )
      .provides((m) => ({ testRunner: m.testRunner }));
    const model = resolve(root, [
      'vite.config.ts',
      'scripts/build/run.ts',
      'src/domain/project.ts',
      'src/domain/project.test.ts',
      'src/ports/store.ts',
      'src/test-helpers/driver.ts',
    ]);
    assert.deepEqual(tree(model), [
      '(root) working-title: []',
      'src/domain layer: []',
      'src/domain:src files: ["src/domain/project.ts"]',
      'src/domain:test files: ["src/domain/project.test.ts"]',
      'src/ports working-title.ports: ["src/ports/store.ts"]',
      'src/test-helpers test-runner: []',
      'src/test-helpers:runner files: ["src/test-helpers/driver.ts"]',
      '(root):tooling files: ["scripts/build/run.ts","vite.config.ts"]',
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
