import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import type { ModuleView } from '../domain/model/resolve.ts';
import type { FileFacts, ImportEdge } from '../domain/facts/facts.ts';
import type { Model } from '../domain/model/resolve.ts';
import { crossed, limitOptions, listed, valueUses } from './boundaries.ts';

const module = (id: string, parent?: ModuleView): ModuleView => {
  const view: ModuleView = {
    id,
    kind: 'dir',
    dir: id,
    captures: {},
    children: [],
    files: [],
    looseFiles: [],
    ...(parent ? { parent } : {}),
  };
  parent?.children.push(view);
  return view;
};

const root = module('(root)');
const ui = module('ui', root);
const cart = module('ui/cart', ui);
const badge = module('ui/cart/badge', cart);
const domain = module('domain', root);

describe('crossed', () => {
  it("is the module just below the nearest module both share, on the target's side", () => {
    assert.equal(crossed(domain, badge), ui);
    assert.equal(crossed(badge, domain), domain);
    assert.equal(crossed(cart, badge), badge);
    assert.equal(crossed(ui, badge), cart);
  });

  it('is the target itself when the target holds the source, and nothing within one module', () => {
    assert.equal(crossed(badge, ui), ui);
    assert.equal(crossed(cart, cart), undefined);
    assert.equal(crossed(cart, root), root);
    assert.equal(crossed(root, cart), ui);
  });
});

describe('limitOptions', () => {
  const parse = limitOptions({ max: 2, ignore: [] });

  it('takes a whole-number max and a list of names', () => {
    assert.deepEqual(parse({ max: 3, ignore: ['icons'] }, 'at'), { max: 3, ignore: ['icons'] });
    assert.deepEqual(parse({ max: 3 }, 'at'), { max: 3 });
    assert.deepEqual(parse({ ignore: [] }, 'at'), { ignore: [] });
  });

  it('refuses another key, a max that is no whole number, and an ignore that is no list of names', () => {
    assert.throws(() => parse({ limit: 3 }, 'at'), { message: 'at: unknown key limit' });
    assert.throws(() => parse({ max: 0 }, 'at'), { message: 'at.max: expected a whole number of at least 1' });
    assert.throws(() => parse({ ignore: 'icons' }, 'at'), { message: 'at.ignore: expected a list of module names' });
    assert.throws(() => parse({ ignore: ['icons', 3] }, 'at'), {
      message: 'at.ignore: expected a list of module names',
    });
  });
});

describe('listed', () => {
  it('joins names with commas and a last and', () => {
    assert.equal(listed(['a']), 'a');
    assert.equal(listed(['a', 'b']), 'a and b');
    assert.equal(listed(['a', 'b', 'c']), 'a, b and c');
  });
});

describe('valueUses', () => {
  const edge = (to: string, names: string[], extra: Partial<ImportEdge> = {}): ImportEdge => ({
    from: '',
    to,
    specifier: to,
    names,
    typeOnly: false,
    line: 1,
    ...extra,
  });
  const facts = (path: string, imports: ImportEdge[]): FileFacts => ({
    path,
    lines: 1,
    imports,
    externals: [],
    unresolved: [],
    members: { members: [], links: [] },
    functions: [],
    classes: [],
  });
  const model = { isTest: (file: string) => file.endsWith('.test.ts') } as Model;

  it('lists each value name production code imports from production code, by name', () => {
    const used = valueUses(model, [
      facts('a.ts', [
        edge('b.ts', ['run', 'stop']),
        edge('b.ts', ['Type'], { typeOnly: true }),
        edge('b.ts', ['again'], { reExport: true }),
        edge('b.ts', ['*']),
        edge('b.test.ts', ['helper']),
        edge('gone.ts', ['lost']),
      ]),
      facts('b.ts', []),
      facts('b.test.ts', [edge('b.ts', ['run'])]),
    ]);
    assert.deepEqual(
      used.map(({ file, edge: { to }, name }) => [file, to, name]),
      [
        ['a.ts', 'b.ts', 'run'],
        ['a.ts', 'b.ts', 'stop'],
      ],
    );
  });
});
