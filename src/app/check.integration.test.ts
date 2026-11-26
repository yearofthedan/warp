import assert from 'node:assert/strict';
import { join } from 'node:path';
import { beforeAll, describe, it } from 'vite-plus/test';
import { diskFolders } from '../adapters/analysis/folders.ts';
import { typescriptAnalyzer } from '../adapters/analysis/typescript.ts';
import { projectCheck } from '../app/check.ts';
import { builtinRegistry, unclassifiedDocs } from '../builtins/index.ts';
import { loadConfig } from '../adapters/config/loadConfig.ts';
import { loadConfigData } from './load.ts';
import type { Finding } from '../domain/rules/rule.ts';

const root = join(import.meta.dirname, '../../fixtures/hexagonal-app');
let findings: Finding[];

beforeAll(async () => {
  const { raw, plugins } = await loadConfig(join(root, 'warp.yaml'));
  const { config, rules } = loadConfigData(raw, { builtins: [...builtinRegistry.values()], plugins });
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
      'unused-declaration:grant:root.adapters.dependencies->app',
      'unused-declaration:surface:root.app:exposes: all',
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

  it('passes a file over the tripwire whose code is one group', () => {
    assert.equal(byKey('file-cohesion:src/adapters/db/orderRepo.ts'), undefined);
  });
});
