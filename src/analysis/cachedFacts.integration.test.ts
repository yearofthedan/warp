import assert from 'node:assert/strict';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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

const reanalyzedAfter = (change: () => void): string[] => {
  analyze(store);
  for (const entry of Object.values(saved!.files)) if (entry.facts) entry.facts.lines = 0;
  change();
  return analyze(store)
    .files.filter((file) => file.lines > 0)
    .map((file) => file.path)
    .sort();
};

const everyFile = [
  'src/adapters/db/orderRepo.ts',
  'src/adapters/index.ts',
  'src/app/handle.ts',
  'src/app/index.ts',
  'src/domain/order.ts',
  'src/domain/pricing.ts',
  'src/stray.ts',
];

describe('cached facts', () => {
  it('gives the same facts as an uncached analysis, before and after an edit', () => {
    assert.deepEqual(analyze(store), analyze());
    assert.deepEqual(analyze(store), analyze());
    appendFileSync(join(root, 'src/domain/order.ts'), '\nexport const extra = 1;\n');
    assert.deepEqual(analyze(store), analyze());
  });

  it('reanalyzes only the edited file and the files that import it', () => {
    const reanalyzed = reanalyzedAfter(() => appendFileSync(join(root, 'src/app/handle.ts'), '\n'));
    assert.deepEqual(reanalyzed, ['src/app/handle.ts', 'src/app/index.ts']);
  });

  it('reanalyzes every file when a compiler option changes in a config the tsconfig extends', () => {
    const base = (strict: boolean) =>
      writeFileSync(join(root, 'tsconfig.base.json'), JSON.stringify({ compilerOptions: { strict } }));
    base(true);
    const tsconfig = {
      extends: './tsconfig.base.json',
      compilerOptions: { module: 'nodenext', noEmit: true, allowImportingTsExtensions: true },
      include: ['src'],
    };
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify(tsconfig));
    assert.deepEqual(
      reanalyzedAfter(() => base(false)),
      everyFile,
    );
  });

  it('reanalyzes every file when a package the program reads changes', () => {
    const types = join(root, 'node_modules/@types/extra');
    mkdirSync(types, { recursive: true });
    writeFileSync(join(types, 'index.d.ts'), 'declare const extra: number;\n');
    const tsconfig = {
      compilerOptions: { module: 'nodenext', types: ['extra'], noEmit: true, allowImportingTsExtensions: true },
      include: ['src'],
    };
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify(tsconfig));
    assert.deepEqual(
      reanalyzedAfter(() => writeFileSync(join(types, 'index.d.ts'), 'declare const extra: boolean;\n')),
      everyFile,
    );
  });
});
