import assert from 'node:assert/strict';
import { join } from 'node:path';
import { beforeAll, describe, it } from 'vite-plus/test';
import { typescriptAnalyzer } from '../analysis/typescript.ts';
import type { ModuleFacts } from '../model/facts.ts';

const root = join(import.meta.dirname, '../../fixtures/facts');
let modules: Map<string, ModuleFacts>;

beforeAll(() => {
  modules = new Map(typescriptAnalyzer.analyze(root, ['tsconfig.json']).modules.map((module) => [module.file, module]));
});

const fn = (name: string) => modules.get('src/complexity.ts')?.functions.find((f) => f.name === name);

describe('import graph', () => {
  it('resolves named imports through a barrel to the declaring module', () => {
    const edges = modules.get('src/complexity.ts')?.imports ?? [];
    const named = edges.find((edge) => edge.line === 3);
    assert.deepEqual(named, {
      from: 'src/complexity.ts',
      to: 'src/lib/shapes.ts',
      via: 'src/lib/index.ts',
      specifier: './lib/index.ts',
      names: ['Square', 'Circle'],
      typeOnly: false,
      line: 3,
    });
  });

  it('points side-effect and namespace imports at the module the specifier resolves to', () => {
    const edges = modules.get('src/complexity.ts')?.imports ?? [];
    assert.deepEqual(
      edges.filter((edge) => edge.line < 3).map((edge) => [edge.to, edge.names]),
      [
        ['src/lib/index.ts', []],
        ['src/lib/index.ts', ['lib']],
      ],
    );
  });

  it('records re-exports as edges from the barrel', () => {
    const edges = modules.get('src/lib/index.ts')?.imports ?? [];
    assert.deepEqual(
      edges.map((edge) => [edge.to, edge.names, edge.reExport]),
      [
        ['src/lib/shapes.ts', ['Circle', 'Square'], true],
        ['src/lib/shapes.ts', [], true],
      ],
    );
  });

  it('splits imported names the module exports again from the ones it only uses', () => {
    const edges = modules.get('src/relay.ts')?.imports ?? [];
    assert.deepEqual(
      edges.map((edge) => [edge.to, edge.names, edge.typeOnly, edge.reExport ?? false]),
      [
        ['src/lib/shapes.ts', ['Square'], false, true],
        ['src/lib/shapes.ts', ['unit'], false, false],
        ['src/lib/shapes.ts', ['Circle'], true, true],
      ],
    );
  });

  it('keeps an import of a package apart, by package name, whether or not it resolves', () => {
    const module = modules.get('src/externals.ts')!;
    assert.deepEqual(
      module.externals.map(({ package: name, specifier, names, typeOnly, reExport, line }) => [
        name,
        specifier,
        names,
        typeOnly,
        reExport ?? false,
        line,
      ]),
      [
        ['left-pad', 'left-pad', [], false, false, 1],
        ['node:path', 'node:path', ['join'], false, false, 2],
        ['node:fs', 'fs/promises', ['readFile'], false, false, 3],
        ['@scope/tool', '@scope/tool/plugin', ['Plugin'], true, false, 4],
        ['virtual:config', 'virtual:config', ['Config', 'defineConfig'], false, false, 5],
        ['yaml', 'yaml', ['parse'], false, true, 8],
      ],
    );
    assert.deepEqual(
      module.imports.map((edge) => edge.specifier),
      ['./lib/index.ts'],
    );
  });

  it('marks an import type-only when every name declares only a type', () => {
    const hexagonalApp = join(import.meta.dirname, '../../fixtures/hexagonal-app');
    const order = typescriptAnalyzer
      .analyze(hexagonalApp, ['tsconfig.json'])
      .modules.find((module) => module.file === 'src/domain/order.ts');
    assert.deepEqual(
      order?.imports.map((edge) => [edge.names, edge.typeOnly]),
      [
        [['saveOrder'], false],
        [['OrderRow'], true],
      ],
    );
  });
});

describe('cognitive complexity', () => {
  it('counts a ternary and direct recursion', () => assert.equal(fn('sum')?.complexity?.total, 2));
  it('counts each parenthesised run of logical operators once', () => assert.equal(fn('mixed')?.complexity?.total, 2));
  it('deepens nesting inside a nested function and counts a labelled jump', () => {
    assert.deepEqual(
      fn('outer')?.complexity?.increments.map((i) => [i.reason, i.amount]),
      [
        ['for', 1],
        ['if', 3],
        ['if', 2],
        ['labelled continue', 1],
      ],
    );
  });
  it('counts recursion through this', () => assert.equal(fn('Tree.walk')?.complexity?.total, 1));
  it('ignores a call to a local that shadows the function name', () =>
    assert.equal(fn('shadowed')?.complexity?.total, 0));
  it('folds nested functions into the outermost one', () => assert.equal(fn('check')?.complexity, undefined));
});

describe('function names', () => {
  it('name a callback by its call and a string first argument', () => {
    const names = [...modules.values()].flatMap((m) => m.functions.map((f) => f.name));
    assert.ok(names.includes('<callback to [1, 2].map>'));
    assert.deepEqual(
      modules
        .get('src/callbacks.ts')
        ?.functions.map((f) => f.name)
        .slice(1),
      ['<callback to it("first")>', '<callback to it("second")>'],
    );
  });
});

describe('function statements', () => {
  it('links statements that share a this member', () => {
    assert.deepEqual(fn('Counter.bump')?.statements.links, [[0, 2]]);
  });
});
