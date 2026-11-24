import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { archetype, files } from '../model/archetype/builder.ts';
import type { FileFacts } from '../model/facts.ts';
import { modelProject } from './check.ts';
import { loadConfigData } from './load.ts';

const facts = (path: string): FileFacts => ({
  path,
  lines: 1,
  imports: [],
  externals: [],
  unresolved: [],
  members: { members: [], links: [] },
  functions: [],
});

const analyzed = (paths: readonly string[]) => ({
  analyzer: { analyze: () => ({ files: paths.map(facts) }) },
  foldersAt: () => ({ folders: () => [], exists: () => true }),
});

describe('modelProject', () => {
  it("leaves warp's own config file out of the project and the model", () => {
    const root = archetype('app').contains((c) => c.module('code', files('*.ts')));
    const { config } = loadConfigData({ root }, { file: 'warp.config.ts' });
    const { model, project } = modelProject(analyzed(['warp.config.ts', 'main.ts']), '.', config);
    assert.deepEqual(
      project.files.map((file) => file.path),
      ['main.ts'],
    );
    assert.equal(model.moduleOf('warp.config.ts'), undefined);
  });
});
