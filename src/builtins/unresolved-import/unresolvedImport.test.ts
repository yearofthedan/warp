import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import type { FileFacts, UnresolvedImport } from '../../domain/facts/facts.ts';
import { unresolvedImport } from './unresolvedImport.ts';

const facts = (path: string, unresolved: UnresolvedImport[] = []): FileFacts => ({
  path,
  lines: 1,
  imports: [],
  externals: [],
  unresolved,
  members: { members: [], links: [] },
  functions: [],
});

describe('unresolved-import', () => {
  it('reports each relative import that resolves to no file', () => {
    const file = facts('src/ui/card.test.ts', [{ from: 'src/ui/card.test.ts', specifier: './crad', line: 3 }]);
    assert.deepEqual(unresolvedImport.check({ file, options: {} }), [
      {
        rule: 'unresolved-import',
        key: 'unresolved-import:src/ui/card.test.ts->./crad',
        file: 'src/ui/card.test.ts',
        line: 3,
        value: 1,
        message: './crad from src/ui/card.test.ts resolves to no file. Fix the path, or add the file it names.',
        details: { from: 'src/ui/card.test.ts', specifier: './crad' },
      },
    ]);
  });

  it('passes a file whose imports all resolve', () => {
    assert.deepEqual(unresolvedImport.check({ file: facts('src/ui/card.ts'), options: {} }), []);
  });
});
