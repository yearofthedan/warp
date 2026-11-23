import assert from 'node:assert/strict';
import { join } from 'node:path';
import { beforeAll, describe, it } from 'vite-plus/test';
import { diskFolders } from '../analysis/folders.ts';
import { typescriptAnalyzer } from '../analysis/typescript.ts';
import { projectCheck } from '../app/check.ts';
import { builtinRegistry, unclassifiedDocs } from '../builtins/index.ts';
import { loadConfig } from '../config/loadConfig.ts';
import { loadConfigData } from './load.ts';
import type { Finding } from '../rules/rule.ts';

const root = join(import.meta.dirname, '../../fixtures/hexagonal-app');
let findings: Finding[];

beforeAll(async () => {
  const { raw } = await loadConfig(join(root, 'warp.config.ts'));
  const { config, rules } = loadConfigData(raw, { builtins: [...builtinRegistry.values()] });
  const adapters = { analyzer: typescriptAnalyzer, foldersAt: diskFolders };
  findings = projectCheck(adapters, config, { rules, unclassifiedDocs }).check(root);
});

const byKey = (key: string) => findings.find((finding) => finding.key === key);

describe('check', () => {
  it('reports every rule once per subject', () => {
    assert.deepEqual(findings.map((finding) => finding.key).sort(), [
      'cognitive-complexity:src/app/handle.ts:grade',
      'dependency-direction:src/domain/order.ts->src/adapters/index.ts',
      'dependency-direction:src/domain/pricing.ts->src/adapters/db/orderRepo.ts',
      'file-cohesion:src/app/handle.ts',
      'file-cohesion:src/domain/pricing.ts',
      'function-cohesion:src/app/handle.ts:handle',
      'module-cycle:src/adapters+src/domain',
      'no-cross-module-reexport:src/app/index.ts->src/domain/order.ts',
      'no-cycle:src/adapters/db/orderRepo.ts+src/adapters/index.ts+src/domain/order.ts',
      'no-double-export:src/adapters/index.ts->src/adapters/db/orderRepo.ts',
      'no-double-export:src/app/index.ts->src/app/handle.ts',
      'unclassified:src/stray.ts',
      'unused-declaration:grant:hexagon.adapters->app',
    ]);
  });

  it('links each finding to its rule page', () => {
    assert.equal(
      byKey('no-cross-module-reexport:src/app/index.ts->src/domain/order.ts')?.docs,
      'https://github.com/yearofthedan/warp/blob/main/src/builtins/no-cross-module-reexport/README.md',
    );
  });

  it('links a loose file to the unclassified page', () => {
    assert.equal(
      byKey('unclassified:src/stray.ts')?.docs,
      'https://github.com/yearofthedan/warp/blob/main/src/builtins/unclassified/README.md',
    );
  });

  it('reports the groups a file splits into', () => {
    assert.deepEqual(byKey('file-cohesion:src/domain/pricing.ts')?.details, {
      lines: 17,
      tripwire: 15,
      groups: [
        { names: ['rate', 'tax', 'gross'], lines: [3, 7] },
        { names: ['label'], lines: [9, 11] },
        { names: ['shout', 'banner'], lines: [13, 17] },
      ],
    });
  });

  it('reports the statement groups a function splits into', () => {
    assert.deepEqual((byKey('function-cohesion:src/app/handle.ts:handle')!.details as { groups: unknown }).groups, [
      { names: ['line 4', 'line 5', 'line 6'], lines: [4, 6] },
      { names: ['line 7', 'line 8', 'line 9'], lines: [7, 9] },
    ]);
  });

  it('passes a file over the tripwire whose code is one group', () => {
    assert.equal(byKey('file-cohesion:src/adapters/db/orderRepo.ts'), undefined);
  });
});
