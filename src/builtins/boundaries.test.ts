import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import type { ModuleView } from '../domain/model/resolve.ts';
import { crossed } from './boundaries.ts';

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
  });
});
