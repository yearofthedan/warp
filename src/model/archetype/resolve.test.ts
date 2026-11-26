import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import { ConfigError } from '../configError.ts';
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

const resolve = (yaml: string, files: readonly string[], extra: readonly string[] = []): Model =>
  resolveModel(loadConfigData(parse(yaml)).config, folders([...files, ...extra]), files);

const errors = (yaml: string, files: readonly string[]): string[] => {
  try {
    resolve(yaml, files);
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
    const model = resolve("root: { modules: { main: { files: main.ts }, rest: { files: '**' } } }", [
      'main.ts',
      'src/a.ts',
      'src/b/c.ts',
    ]);
    assert.equal(model.root.id, '(root)');
    assert.equal(model.root.dir, '');
    assert.equal(model.root.kind, 'dir');
    assert.equal(model.root.archetype, 'root');
    assert.ok(!('name' in model.root));
    assert.ok(!('parent' in model.root));
    assert.deepEqual(model.root.captures, {});
    assert.deepEqual(tree(model), [
      '(root) root: []',
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
    const model = resolve("root: { modules: { domain: { dir: src/domain }, rest: { files: '**' } } }", [
      'src/domain/order.ts',
      'src/domain/deep/price.ts',
      'src/main.ts',
    ]);
    assert.deepEqual(tree(model), [
      '(root) root: []',
      'src/domain root.domain: ["src/domain/deep/price.ts","src/domain/order.ts"]',
      '(root):rest files: ["src/main.ts"]',
    ]);
    const [domain] = model.root.children;
    assert.equal(domain?.parent, model.root);
    assert.equal(domain?.name, 'domain');
    assert.equal(model.moduleOf('src/domain/deep/price.ts'), domain);
    assert.deepEqual(domain?.looseFiles, []);
  });

  it("lists a module's children in declaration order, a dir module's folders in path order", () => {
    const model = resolve("root: { modules: { z: { files: z.ts }, features: { dir: '*' }, a: { files: a.ts } } }", [
      'z.ts',
      'a.ts',
      'b/b.ts',
      'a/a.ts',
    ]);
    assert.deepEqual(
      model.modules.map((module) => module.id),
      ['(root)', '(root):z', 'a', 'b', '(root):a'],
    );
  });

  it('finds the modules an inline contains declares, under an archetype named for where it sits', () => {
    const root = `
root:
  modules:
    app:
      dir: src/app
      modules: { ports: { files: ports.ts }, core: { dir: core } }
`;
    const model = resolve(root, ['src/app/ports.ts', 'src/app/core/a.ts', 'src/app/stray.ts']);
    assert.deepEqual(tree(model), [
      '(root) root: []',
      'src/app root.app: ["src/app/stray.ts"]',
      'src/app:ports files: ["src/app/ports.ts"]',
      'src/app/core root.app.core: ["src/app/core/a.ts"]',
    ]);
    assert.deepEqual(model.moduleOf('src/app/stray.ts')?.looseFiles, ['src/app/stray.ts']);
  });

  it('finds a module per folder a placeholder matches, each with its own captures, down a recursive archetype', () => {
    const root = `
root:
  modules:
    ui: { dir: src/ui, archetype: ui }
archetypes:
  ui:
    modules:
      strings: { dir: strings }
      components: { dir: '*', archetype: component }
  component:
    marker: '{name}.dom.ts'
    modules:
      subcomponent: { dir: '*', archetype: component }
      logic: { files: '*.ts' }
      dom: { files: '{name}.dom.ts' }
      test: { files: '*.test.ts' }
`;
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
      '(root) root: []',
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
    const root = `
root:
  modules:
    widgets: { dir: 'src/*', archetype: widget }
archetypes:
  widget:
    marker: '{name}.json'
    modules:
      src: { files: '**' }
`;
    const model = resolve(root, ['src/a/a.ts', 'src/b/b.ts', 'src/c/c.ts'], ['src/a/a.json', 'src/c/a.json']);
    assert.deepEqual(
      model.modules.map((module) => module.id),
      ['(root)', 'src/a', 'src/a:src'],
    );
    assert.deepEqual(model.root.looseFiles, ['src/b/b.ts', 'src/c/c.ts']);
  });

  it('gives a folder to the most specific dir module: a literal segment beats a placeholder', () => {
    const root = `
root:
  modules:
    anywhere: { dir: '*' }
    components: { dir: 'src/*' }
    strings: { dir: src/strings }
`;
    const model = resolve(root, ['src/strings/en.ts', 'src/card/card.ts', 'lib/x.ts']);
    assert.deepEqual(
      model.modules.map((module) => [module.id, module.name]),
      [
        ['(root)', undefined],
        ['lib', 'anywhere'],
        ['src', 'anywhere'],
        ['src/card', 'components'],
        ['src/strings', 'strings'],
      ],
    );
  });

  it('lets one dir module match a folder through two of its paths', () => {
    const root = "root: { modules: { code: { dir: [src/a, 'src/*'] } } }";
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
    const root = "root: { modules: { a: { dir: 'src/*' }, b: { dir: [lib, 'src/*'] } } }";
    assert.deepEqual(errors(root, ['src/x/x.ts', 'lib/y.ts']), [
      "src/x: root's dir modules a ('src/*') and b ('src/*') are equally specific; narrow one of the paths",
    ]);
  });

  it('refuses a folder that two modules claim from different levels', () => {
    const root = `
root:
  modules:
    outer: { dir: src, archetype: inner }
    direct: { dir: src/deep }
archetypes:
  inner: { modules: { deep: { dir: deep } } }
`;
    assert.deepEqual(errors(root, ['src/deep/x.ts']), [
      'src/deep: found as a module of direct and of outer.deep; one folder is one module',
    ]);
  });

  it('places a file in its deepest folder module, whichever module found it', () => {
    const root = 'root: { modules: { src: { dir: src }, domain: { dir: src/domain } } }';
    const model = resolve(root, ['src/a.ts', 'src/domain/b.ts']);
    assert.equal(model.moduleOf('src/a.ts')?.id, 'src');
    assert.equal(model.moduleOf('src/domain/b.ts')?.id, 'src/domain');
    assert.deepEqual(model.moduleOf('src/a.ts')?.files, ['src/a.ts']);
  });

  it('gives a file to the most specific files module, whatever their order', () => {
    const root = `
root:
  modules:
    rest: { files: '**' }
    code: { files: '*.ts' }
    specs: { files: '*.test.ts' }
    nested: { files: 'src/**' }
    main: { files: main.ts }
    one: { files: src/one.ts }
`;
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
    const root = `
root:
  modules:
    components: { dir: '*', archetype: component }
archetypes:
  component:
    modules:
      logic: { files: '*.ts' }
      dom: { files: '{name}.dom.ts' }
`;
    const model = resolve(root, ['card/card.dom.ts', 'card/other.dom.ts']);
    assert.equal(model.moduleOf('card/card.dom.ts')?.id, 'card:dom');
    assert.equal(model.moduleOf('card/other.dom.ts')?.id, 'card:logic');
  });

  it('refuses files modules that match a file equally specifically, once per file', () => {
    const root = "root: { modules: { a: { files: ['*.dsl.ts', x.ts] }, b: { files: 'card.*' } } }";
    assert.deepEqual(tree(resolve(root, ['card.dsl.ts', 'card.ts'])).slice(1), [
      '(root):a files: ["card.dsl.ts"]',
      '(root):b files: ["card.ts"]',
    ]);
    const tied = "root: { modules: { a: { files: '*.test.ts' }, b: { files: '**/*.test.ts' } } }";
    assert.deepEqual(errors(tied, ['a.test.ts', 'src/b.test.ts']), [
      "a.test.ts: root's files modules a ('*.test.ts') and b ('**/*.test.ts') are equally specific; narrow one of the patterns",
    ]);
    const folders = "root: { modules: { domain: { files: 'src/domain/**' }, refs: { files: 'src/domain/refs/**' } } }";
    assert.deepEqual(errors(folders, ['src/domain/refs/a.ts']), [
      "src/domain/refs/a.ts: root's files modules domain ('src/domain/**') and refs ('src/domain/refs/**') are equally specific; declare the folders with dir, where the deeper folder wins",
    ]);
  });

  it('refuses a placeholder that the module does not capture, in a files pattern or a marker', () => {
    const root = `
root:
  modules:
    dom: { files: '{name}.dom.ts' }
    c: { dir: '*', archetype: component }
archetypes:
  component:
    marker: '{id}.dom.ts'
    modules:
      dom: { files: '*.dom.ts' }
`;
    assert.deepEqual(errors(root, ['a.dom.ts', 'b.dom.ts', 'x/x.dom.ts']), [
      "x: component's marker '{id}.dom.ts' names {id}, which its dir path doesn't capture",
      "root.dom.files: '{name}.dom.ts' names {name}, which (root) doesn't capture",
    ]);
  });

  it('points a literal dir whose marker needs a placeholder, among siblings that capture it, at a shared folder', () => {
    const component = `
archetypes:
  component:
    marker: '{name}.dom.ts'
    modules:
      dom: { files: '*.dom.ts' }
`;
    const root = `
root:
  modules:
    header: { dir: header, archetype: component }
    components: { dir: '*', archetype: component }
${component}`;
    assert.deepEqual(errors(root, ['header/header.dom.ts', 'card/card.dom.ts']), [
      "header: component's marker '{name}.dom.ts' names {name}, which its dir path doesn't capture. A literal dir " +
        'binds no placeholders. If components use header, it is shared: move header out of the folders ' +
        "dir: '*' matches, for example into shared/header, and declare it as its own module with dir: 'shared/*'",
    ]);
    const alone = `root: { modules: { header: { dir: header, archetype: component } } }\n${component}`;
    assert.deepEqual(errors(alone, ['header/header.dom.ts']), [
      "header: component's marker '{name}.dom.ts' names {name}, which its dir path doesn't capture",
    ]);
  });

  it('keeps the files no module matches as loose in their folder module', () => {
    const root = `
root:
  modules:
    quiet: { dir: quiet, archetype: quiet }
    strict: { dir: strict, archetype: strict }
archetypes:
  quiet: { modules: { src: { files: '*.ts' } } }
  strict: { modules: { src: { files: '*.ts' } } }
`;
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
    const root = `
root:
  modules:
    domain: { dir: src/domain, archetype: layer, dependencies: [testRunner] }
    ports: { dir: src/ports }
    testRunner: { dir: src/test-helpers, archetype: test-runner }
    tooling: { files: ['*.ts', 'scripts/**/*.ts'] }
archetypes:
  test-runner:
    exposes: all
    modules:
      runner: { files: '**', exposes: all }
  layer:
    requires: [testRunner]
    modules:
      src: { files: '**' }
      test: { files: '**/*.test.ts', dependencies: [testRunner, npm:vite-plus/*] }
`;
    const model = resolve(root, [
      'vite.config.ts',
      'scripts/build/run.ts',
      'src/domain/project.ts',
      'src/domain/project.test.ts',
      'src/ports/store.ts',
      'src/test-helpers/driver.ts',
    ]);
    assert.deepEqual(tree(model), [
      '(root) root: []',
      'src/domain layer: []',
      'src/domain:src files: ["src/domain/project.ts"]',
      'src/domain:test files: ["src/domain/project.test.ts"]',
      'src/ports root.ports: ["src/ports/store.ts"]',
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
