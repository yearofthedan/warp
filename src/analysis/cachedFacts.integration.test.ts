import assert from 'node:assert/strict';
import { appendFileSync, cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, it } from 'vite-plus/test';
import { typescriptAnalyzer } from '../analysis/typescript.ts';
import type { CachedFacts, FactsStore } from '../app/ports.ts';

let root: string;
let saved: CachedFacts | undefined;
const store: FactsStore = { read: () => saved, write: (facts) => (saved = structuredClone(facts)) };

const analyze = (facts?: FactsStore) => typescriptAnalyzer.analyze(root, ['tsconfig.json'], facts);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'warp-facts-'));
  cpSync(join(import.meta.dirname, '../../fixtures/hexagonal-app'), root, { recursive: true });
  saved = undefined;
});

describe('cached facts', () => {
  it('gives the same facts as an uncached analysis, before and after an edit', () => {
    assert.deepEqual(analyze(store), analyze());
    assert.deepEqual(analyze(store), analyze());
    appendFileSync(join(root, 'src/domain/order.ts'), '\nexport const extra = 1;\n');
    assert.deepEqual(analyze(store), analyze());
  });

  it('reanalyzes only the edited file and the files that import it', () => {
    analyze(store);
    for (const entry of Object.values(saved!.files)) if (entry.facts) entry.facts.lines = 0;
    appendFileSync(join(root, 'src/app/handle.ts'), '\n');
    const reanalyzed = analyze(store)
      .modules.filter((module) => module.lines > 0)
      .map((module) => module.file);
    assert.deepEqual(reanalyzed.sort(), ['src/app/handle.ts', 'src/app/index.ts']);
  });
});
