import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'vite-plus/test';
import { parseConfig } from './adapters/config/loadConfig.ts';
import { loadConfigData } from './app/load.ts';
import { builtinRegistry } from './builtins/index.ts';

type Example = { line: number; code: string; fragment: boolean };
type Block = { line: number; info: string; code: string };
type Doc = { doc: string; text: string };
type Planned = { code: string; doc: string; line: number };

const repo = join(import.meta.dirname, '..');
const dated = /^docs\/adr\/\d{4}-[^/]+\.md$/;
const sketches = /^docs\/design\//;

const blocksIn = (text: string): Block[] => {
  const blocks: Block[] = [];
  let open: { line: number; info: string; code: string[] } | undefined;
  text.split('\n').forEach((line, index) => {
    const fence = /^\s*```(.*)$/.exec(line);
    if (!open) {
      if (fence) open = { line: index + 2, info: fence[1].trim(), code: [] };
    } else if (fence && fence[1].trim() === '') {
      blocks.push({ line: open.line, info: open.info, code: open.code.join('\n') });
      open = undefined;
    } else open.code.push(line);
  });
  return blocks;
};

const examplesIn = (text: string): Example[] =>
  blocksIn(text)
    .filter((block) => block.info === 'ts' || block.info === 'ts fragment')
    .map(({ line, info, code }) => ({ line, code, fragment: info !== 'ts' }));

const configsIn = (text: string): { line: number; code: string }[] =>
  blocksIn(text)
    .filter((block) => block.info === 'yaml' && /^root:/m.test(block.code))
    .map(({ line, code }) => ({ line, code }));

const valueExports = (indexSource: string): string[] =>
  [...indexSource.matchAll(/export\s*\{([^}]*)\}/g)]
    .flatMap(([, names]) => names.split(','))
    .map((name) => name.trim())
    .filter((name) => name !== '' && !name.startsWith('type '));

const examplePath = (example: Example): string | undefined =>
  /^\/\/ ((?:[\w.-]+\/)*[\w.-]+\.ts)(:.*)?$/.exec(example.code.split('\n')[0] ?? '')?.[1];

const fragmentProblems = (doc: string, code: string, api: string[]): string[] => {
  const problems: string[] = [];
  if (sketches.test(doc)) return problems;
  if (/from\s+['"]@yearofthedan\/warp['"]/.test(code))
    problems.push("imports from '@yearofthedan/warp', so it is a ts example");
  for (const name of api) {
    if (new RegExp(`(?<![.\\w])${name}\\s*[(<]`).test(code)) problems.push(`calls ${name}, so it is a ts example`);
  }
  return problems;
};

const planned = (docs: Doc[]): Map<string, Planned> => {
  const files = new Map<string, Planned>();
  for (const { doc, text } of docs) {
    for (const example of examplesIn(text).filter((e) => !e.fragment)) {
      const path = examplePath(example) ?? 'example.ts';
      const file = files.has(`${doc}/${path}`) ? `${doc}/example-${example.line}/${path}` : `${doc}/${path}`;
      files.set(file, { code: `${example.code}\nexport {};\n`, doc, line: example.line });
    }
  }
  return files;
};

const located = (diagnostic: string, files: Map<string, Planned>): string => {
  const match = /^(\S+\.ts)\((\d+),\d+\): (.*)$/.exec(diagnostic);
  const source = match && files.get(match[1]);
  return source ? `${source.doc}:${source.line + Number(match[2]) - 1}: ${match[3]}` : diagnostic;
};

const typeProblems = (files: Map<string, Planned>): string[] => {
  const out = join(repo, 'node_modules/.cache/doc-examples');
  rmSync(out, { recursive: true, force: true });
  for (const [file, { code }] of files) {
    mkdirSync(dirname(join(out, file)), { recursive: true });
    writeFileSync(join(out, file), code);
  }
  mkdirSync(out, { recursive: true });
  const tsconfig = {
    extends: join(repo, 'tsconfig.json'),
    compilerOptions: { paths: { '@yearofthedan/warp': [join(repo, 'src/index.ts')] } },
    include: ['**/*.ts'],
  };
  writeFileSync(join(out, 'tsconfig.json'), JSON.stringify(tsconfig));
  const tsc = join(repo, 'node_modules/.bin/tsc');
  const run = spawnSync(tsc, ['-p', 'tsconfig.json', '--pretty', 'false'], { cwd: out, encoding: 'utf8' });
  if (run.status === 0) return [];
  return `${run.stdout}${run.stderr}`
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => located(line, files));
};

const loadProblems = (doc: string, code: string): string[] => {
  const builtins = [...builtinRegistry.values()];
  try {
    const { raw } = parseConfig(code, doc);
    const declared = (raw as { plugins?: Record<string, unknown> }).plugins ?? {};
    const plugins = Object.fromEntries(Object.keys(declared).map((namespace) => [namespace, { rules: [] }]));
    loadConfigData(raw, { ...(Object.keys(plugins).length === 0 ? { builtins } : {}), plugins, file: doc });
    return [];
  } catch (error) {
    return String((error as Error).message).split('\n');
  }
};

const docs = (): Doc[] =>
  execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '*.md'], {
    cwd: repo,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(
      (file) =>
        file !== '' &&
        !file.startsWith('fixtures/') &&
        !file.endsWith('.approved.md') &&
        !dated.test(file) &&
        existsSync(join(repo, file)),
    )
    .map((doc) => ({ doc, text: readFileSync(join(repo, doc), 'utf8') }));

describe('the examples in the docs', () => {
  const all = docs();

  it('load, for each warp.yaml', () => {
    const configs = all.flatMap(({ doc, text }) => configsIn(text).map((config) => ({ doc, ...config })));
    assert.ok(configs.length > 0);
    const problems = configs.flatMap(({ doc, line, code }) =>
      loadProblems(doc, code).map((problem) => `${doc}:${line}: ${problem}`),
    );
    assert.deepEqual(problems, []);
  });

  it("type-check against warp's API, for each ts block", () => {
    const files = planned(all);
    assert.ok(files.size > 0);
    assert.deepEqual(typeProblems(files), []);
  });

  it("are ts blocks, not ts fragments, when they use warp's API", () => {
    const api = valueExports(readFileSync(join(repo, 'src/index.ts'), 'utf8'));
    const problems = all.flatMap(({ doc, text }) =>
      examplesIn(text)
        .filter((example) => example.fragment)
        .flatMap((example) => fragmentProblems(doc, example.code, api).map((p) => `${doc}:${example.line}: ${p}`)),
    );
    assert.deepEqual(problems, []);
  });
});

describe('reading the docs', () => {
  it('collects ts and ts fragment blocks, with the line their code starts on', () => {
    const text = '# A\n```ts\nconst a = 1;\n```\n```sh\nls\n```\n```ts fragment\n.dir()\n```\n';
    assert.deepEqual(examplesIn(text), [
      { line: 3, code: 'const a = 1;', fragment: false },
      { line: 9, code: '.dir()', fragment: true },
    ]);
  });

  it('finds each yaml block that declares a root, leaving out a fragment and other yaml', () => {
    const text = '# A\n\n```yaml\nroot: {}\n```\n\n```yaml fragment\nroot: {}\n```\n\n```yaml\non: push\n```\n';
    assert.deepEqual(configsIn(text), [{ line: 4, code: 'root: {}' }]);
  });

  it('writes each example at the file it names, and a second one with that name apart', () => {
    const text = '# A\n\n```ts\n// rule.ts\nconst a = 1;\n```\n\n```ts\n// rule.ts\nconst b = 1;\n```\n';
    const files = planned([{ doc: 'docs/a.md', text }]);
    assert.deepEqual([...files.keys()], ['docs/a.md/rule.ts', 'docs/a.md/example-9/rule.ts']);
    assert.equal(located('docs/a.md/example-9/rule.ts(2,7): error TS1: no.', files), 'docs/a.md:10: error TS1: no.');
    assert.equal(located('error TS5: elsewhere.', files), 'error TS5: elsewhere.');
  });

  it("refuses a fragment that uses warp's API, outside a design doc, and passes user code", () => {
    const api = valueExports(
      "export { defineConfig, type WarpConfig } from './config.ts';\nexport { dir } from './b.ts';",
    );
    assert.deepEqual(api, ['defineConfig', 'dir']);
    assert.deepEqual(
      fragmentProblems('README.md', "import { x } from '@yearofthedan/warp';\nconst a = dir('a');", api),
      ["imports from '@yearofthedan/warp', so it is a ts example", 'calls dir, so it is a ts example'],
    );
    assert.deepEqual(fragmentProblems('docs/design/a.md', "const a = dir('a');", api), []);
    assert.deepEqual(fragmentProblems('README.md', "import { a } from './a.ts';\np.dir('x', 'y');", api), []);
  });
});
