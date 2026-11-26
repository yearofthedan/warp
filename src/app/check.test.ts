import assert from 'node:assert/strict';
import { describe, it } from 'vite-plus/test';
import { parse } from 'yaml';
import type { FileFacts } from '../domain/facts/facts.ts';
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
    const { config } = loadConfigData(parse("root: { modules: { code: { files: '*.ts' } } }"));
    const { model, project } = modelProject(analyzed(['warp.yaml', 'main.ts']), '.', config);
    assert.deepEqual(
      project.files.map((file) => file.path),
      ['main.ts'],
    );
    assert.equal(model.moduleOf('warp.yaml'), undefined);
  });
});
