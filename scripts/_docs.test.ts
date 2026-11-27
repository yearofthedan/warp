import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { docProblems, headerProblems, linkProblems } from './_docs.ts';

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

  it('leaves conventional root files to their convention', () => {
    assert.deepEqual(headerProblems('CHANGELOG.md', '# Changelog\n\n## [0.2.0]\n'), []);
    assert.deepEqual(headerProblems('README.md', '# warp\n\nBody.\n'), []);
    assert.deepEqual(headerProblems('docs/README.md', '# Docs\n'), [
      'has an **Audience:** line after its title',
      'has a **Purpose:** line after its Audience',
    ]);
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

describe('docProblems', () => {
  it('places each problem at its doc', () => {
    assert.deepEqual(docProblems('docs/a.md', '# A\n\n**Audience:** you.\n**Purpose:** this.\n\n[x](AGENTS.md)\n'), [
      'docs/a.md: links to AGENTS.md: AGENTS.md links into the docs, never the reverse',
    ]);
  });
});
