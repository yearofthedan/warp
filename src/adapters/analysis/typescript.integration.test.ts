import assert from 'node:assert/strict';
import { join } from 'node:path';
import { beforeAll, describe, it } from 'vite-plus/test';
import { typescriptAnalyzer } from './typescript.ts';
import type { FileFacts } from '../../domain/facts/facts.ts';

const root = join(import.meta.dirname, '../../../fixtures/facts');
let files: Map<string, FileFacts>;

beforeAll(() => {
  files = new Map(typescriptAnalyzer.analyze(root, ['tsconfig.json']).files.map((file) => [file.path, file]));
});

const fn = (name: string) => files.get('src/complexity.ts')?.functions.find((f) => f.name === name);

describe('import graph', () => {
  it('resolves named imports through a barrel to the declaring file, one edge for values and one for types', () => {
    const edges = files.get('src/complexity.ts')?.imports ?? [];
    const named = edges.filter((edge) => edge.line === 3);
    const edge = {
      from: 'src/complexity.ts',
      to: 'src/lib/shapes.ts',
      via: 'src/lib/index.ts',
      specifier: './lib/index.ts',
      line: 3,
    };
    assert.deepEqual(named, [
      { ...edge, names: ['Square'], typeOnly: false },
      { ...edge, names: ['Circle'], typeOnly: true },
    ]);
  });

  it('points side-effect and namespace imports at the file the specifier resolves to, a namespace as *', () => {
    const edges = files.get('src/complexity.ts')?.imports ?? [];
    assert.deepEqual(
      edges.filter((edge) => edge.line < 3).map((edge) => [edge.to, edge.names]),
      [
        ['src/lib/index.ts', []],
        ['src/lib/index.ts', ['*']],
      ],
    );
  });

  it('records re-exports as edges from the barrel', () => {
    const edges = files.get('src/lib/index.ts')?.imports ?? [];
    assert.deepEqual(
      edges.map((edge) => [edge.to, edge.names, edge.reExport]),
      [
        ['src/lib/shapes.ts', ['Circle'], true],
        ['src/lib/shapes.ts', ['Square'], true],
        ['src/lib/shapes.ts', [], true],
      ],
    );
  });

  it('names an import by the name its declaring file exports, not the local alias', () => {
    assert.deepEqual(
      files.get('src/alias.ts')?.imports.map((edge) => edge.names),
      [['Square']],
    );
  });

  it('splits imported names the file exports again from the ones it only uses', () => {
    const edges = files.get('src/relay.ts')?.imports ?? [];
    assert.deepEqual(
      edges.map((edge) => [edge.to, edge.names, edge.typeOnly, edge.reExport ?? false]),
      [
        ['src/lib/shapes.ts', ['Square'], false, true],
        ['src/lib/shapes.ts', ['unit'], false, false],
        ['src/lib/shapes.ts', ['Circle'], true, true],
      ],
    );
  });

  it('keeps a relative import that resolves to no file, and passes one naming a file on disk', () => {
    assert.deepEqual(files.get('src/broken.ts')?.unresolved, [
      { from: 'src/broken.ts', specifier: './lib/shaeps.ts', line: 1 },
    ]);
  });

  it('keeps an import of a package apart, by package name, whether or not it resolves', () => {
    const file = files.get('src/externals.ts')!;
    assert.deepEqual(
      file.externals.map(({ package: name, specifier, names, typeOnly, reExport, line }) => [
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
      file.imports.map((edge) => edge.specifier),
      ['./lib/index.ts'],
    );
  });

  it('follows import(), require(), import = require() and import types whose specifier is a literal', () => {
    const file = files.get('src/inline.ts')!;
    assert.deepEqual(
      file.imports.map((edge) => [edge.line, edge.to, edge.names, edge.typeOnly]),
      [
        [1, 'src/lib/shapes.ts', ['*'], false],
        [5, 'src/lib/index.ts', [], false],
        [6, 'src/lib/shapes.ts', [], false],
        [7, 'src/lib/shapes.ts', [], false],
        [11, 'src/lib/shapes.ts', [], true],
      ],
    );
    assert.deepEqual(
      file.externals.map((external) => [external.line, external.package]),
      [[9, 'left-pad']],
    );
    assert.deepEqual(file.unresolved, [{ from: 'src/inline.ts', specifier: './lib/gone.ts', line: 10 }]);
  });

  it('marks an import type-only when every name declares only a type', () => {
    const hexagonalApp = join(import.meta.dirname, '../../../fixtures/hexagonal-app');
    const order = typescriptAnalyzer
      .analyze(hexagonalApp, ['tsconfig.json'])
      .files.find((file) => file.path === 'src/domain/order.ts');
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
    const names = [...files.values()].flatMap((m) => m.functions.map((f) => f.name));
    assert.ok(names.includes('<callback to [1, 2].map>'));
    assert.deepEqual(
      files
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

describe('class members', () => {
  const graph = (name: string) => {
    const facts = files.get('src/classes.ts')?.classes.find((c) => c.name === name);
    const members = facts?.members.members ?? [];
    return {
      members: members.map((m) => `${m.kind} ${m.name}`),
      links: facts?.members.links.map(([a, b]) => `${members[a].name} -> ${members[b].name}`),
    };
  };

  it('reads methods, fields, accessors and inherited fields, and links them through this and the class name', () => {
    assert.deepEqual(graph('Server'), {
      members: [
        'state #buffer',
        'state #handlers',
        'state total',
        'state port',
        'function flush',
        'state count',
        'function add',
        'function listen',
        'function push',
        'function status',
        'state items',
      ],
      links: [
        'total -> #handlers',
        'flush -> #buffer',
        'count -> #handlers',
        'count -> #handlers',
        'add -> #handlers',
        'listen -> port',
        'push -> items',
      ],
    });
  });

  it('names a class expression by its variable', () => {
    assert.deepEqual(graph('Anonymous'), { members: ['state #n', 'function bump'], links: ['bump -> #n'] });
  });

  it('links statements that share a private member', () => {
    const bump = files.get('src/classes.ts')?.functions.find((f) => f.name === 'Counter2.bump');
    assert.deepEqual(bump?.statements.links, [[0, 1]]);
  });
});

describe('member chains', () => {
  it('records each use of an imported value, and each hop onto a member another project file declares', () => {
    const orders = 'src/lib/orders.ts';
    assert.deepEqual(files.get('src/chains.ts')?.chains, [
      { line: 5, hops: [{ file: orders, name: 'Order', member: 'cancel' }], call: true },
      {
        line: 7,
        root: { file: orders, name: 'strings' },
        hops: [
          { file: orders, name: 'strings', member: 'header' },
          { file: orders, name: 'strings', member: 'title' },
        ],
        call: false,
      },
      { line: 9, root: { file: orders, name: 'total' }, hops: [], call: true },
      { line: 9, hops: [{ file: orders, name: 'Shipment', member: 'order' }], call: false },
      { line: 11, root: { file: orders, name: '*' }, hops: [{ file: orders, name: 'total' }], call: true },
      { line: 13, root: { file: orders, name: 'strings' }, hops: [], call: false },
    ]);
  });
});
