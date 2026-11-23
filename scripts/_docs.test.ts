import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import {
  examplePath,
  examplesIn,
  fragmentProblems,
  headerProblems,
  linkProblems,
  located,
  plan,
  valueExports,
} from './_docs.ts';

describe('headerProblems', () => {
  it('passes a page that opens with its title, Audience and Purpose', () => {
    assert.deepEqual(headerProblems('docs/a.md', '# A\n\n**Audience:** you.\n**Purpose:** this.\n\nBody.\n'), []);
  });

  it('refuses a page without them', () => {
    assert.deepEqual(headerProblems('docs/a.md', '# A\n\nBody.\n'), [
      'has an **Audience:** line after its title',
      'has a **Purpose:** line after its Audience',
    ]);
  });

  it('leaves dated decision records and one-line includes as written', () => {
    assert.deepEqual(headerProblems('docs/adr/0001-toolchain.md', '# 1. Toolchain\n'), []);
    assert.deepEqual(headerProblems('CLAUDE.md', '@AGENTS.md\n'), []);
  });
});

describe('examplesIn', () => {
  it('collects ts and ts fragment blocks, with the line their code starts on', () => {
    const text = '# A\n```ts\nconst a = 1;\n```\n```sh\nls\n```\n```ts fragment\n.dir()\n```\n';
    assert.deepEqual(examplesIn(text), [
      { line: 3, code: 'const a = 1;', fragment: false },
      { line: 9, code: '.dir()', fragment: true },
    ]);
  });
});

describe('examplePath', () => {
  it('reads the file an example names on its first line', () => {
    assert.equal(
      examplePath({ line: 1, code: '// src/domain/order.ts: the port\nx', fragment: false }),
      'src/domain/order.ts',
    );
    assert.equal(examplePath({ line: 1, code: 'const a = 1;', fragment: false }), undefined);
  });
});

describe('fragmentProblems', () => {
  const api = valueExports(
    "export { defineConfig, type WarpConfig } from './config.ts';\nexport { archetype, dir } from './b.ts';",
  );

  it('reads the value exports of the entry file', () => {
    assert.deepEqual(api, ['defineConfig', 'archetype', 'dir']);
  });

  it("refuses a fragment that uses warp's API, outside a design doc", () => {
    assert.deepEqual(
      fragmentProblems('README.md', "import { dir } from '@yearofthedan/warp';\nconst a = archetype('a');", api),
      ["imports from '@yearofthedan/warp', so it is a ts example", 'calls archetype, so it is a ts example'],
    );
    assert.deepEqual(fragmentProblems('docs/design/a.md', "const a = archetype('a');", api), []);
  });

  it('passes a fragment of user code, or a method chain', () => {
    assert.deepEqual(fragmentProblems('README.md', "import { a } from './a.ts';\np.dir('x', 'y');", api), []);
  });
});

describe('plan', () => {
  const doc = 'docs/a.md';
  const text = '# A\n\n```ts\n// warp.config.ts\nconst a = 1;\n```\n\n```ts\n// warp.config.ts\nconst b = 1;\n```\n';

  it('writes each example at the file it names, and a second one with that name apart', () => {
    const { files, problems } = plan([{ doc, text }], []);
    assert.deepEqual([...files.keys()], ['docs/a.md/warp.config.ts', 'docs/a.md/example-9/warp.config.ts']);
    assert.deepEqual(problems, [
      'docs/a.md:1: has an **Audience:** line after its title',
      'docs/a.md:1: has a **Purpose:** line after its Audience',
    ]);
  });

  it("points tsc's diagnostics at the doc's own lines", () => {
    const { files } = plan([{ doc, text }], []);
    assert.equal(
      located('docs/a.md/example-9/warp.config.ts(2,7): error TS1: no.', files),
      'docs/a.md:10: error TS1: no.',
    );
    assert.equal(located('error TS5: elsewhere.', files), 'error TS5: elsewhere.');
  });
});

describe('linkProblems', () => {
  it('refuses a doc that links to AGENTS.md, which links into the docs', () => {
    assert.deepEqual(linkProblems('docs/a.md', 'See [tiers](../AGENTS.md#tests).'), [
      'links to ../AGENTS.md#tests: AGENTS.md links into the docs, never the reverse',
    ]);
  });

  it('passes AGENTS.md itself and links elsewhere', () => {
    assert.deepEqual(linkProblems('AGENTS.md', '[x](AGENTS.md)'), []);
    assert.deepEqual(linkProblems('docs/a.md', '[x](../README.md)'), []);
  });
});
