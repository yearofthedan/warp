export type Example = { line: number; code: string; fragment: boolean };

const dated = /^docs\/adr\/\d{4}-[^/]+\.md$/;
const conventional = /^(README|CHANGELOG|CONTRIBUTING|LICENSE|SECURITY|CODE_OF_CONDUCT)\.md$/;
const include = /^@\S+\s*$/;

export const headerProblems = (path: string, text: string): string[] => {
  if (dated.test(path) || conventional.test(path) || include.test(text)) return [];
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  const problems: string[] = [];
  if (!lines[0]?.startsWith('# ')) problems.push('opens with a # title');
  if (!lines[1]?.startsWith('**Audience:** ')) problems.push('has an **Audience:** line after its title');
  if (!lines[2]?.startsWith('**Purpose:** ')) problems.push('has a **Purpose:** line after its Audience');
  return problems;
};

export const linkProblems = (path: string, text: string): string[] =>
  path === 'AGENTS.md'
    ? []
    : [...text.matchAll(/\]\(([^)\s]*AGENTS\.md(#[^)\s]*)?)\)/g)].map(
        ([, target]) => `links to ${target}: AGENTS.md links into the docs, never the reverse`,
      );

export const examplesIn = (text: string): Example[] => {
  const examples: Example[] = [];
  let open: { line: number; info: string; code: string[] } | undefined;
  text.split('\n').forEach((line, index) => {
    const fence = /^\s*```(.*)$/.exec(line);
    if (!open) {
      if (fence) open = { line: index + 2, info: fence[1].trim(), code: [] };
    } else if (fence && fence[1].trim() === '') {
      if (open.info === 'ts' || open.info === 'ts fragment') {
        examples.push({ line: open.line, code: open.code.join('\n'), fragment: open.info !== 'ts' });
      }
      open = undefined;
    } else open.code.push(line);
  });
  return examples;
};

export const valueExports = (indexSource: string): string[] =>
  [...indexSource.matchAll(/export\s*\{([^}]*)\}/g)]
    .flatMap(([, names]) => names.split(','))
    .map((name) => name.trim())
    .filter((name) => name !== '' && !name.startsWith('type '));

export const examplePath = (example: Example): string | undefined =>
  /^\/\/ ((?:[\w.-]+\/)*[\w.-]+\.ts)(:.*)?$/.exec(example.code.split('\n')[0] ?? '')?.[1];

const sketches = /^docs\/design\//;

export const fragmentProblems = (doc: string, code: string, api: string[]): string[] => {
  const problems: string[] = [];
  if (sketches.test(doc)) return problems;
  if (/from\s+['"]@yearofthedan\/warp['"]/.test(code))
    problems.push("imports from '@yearofthedan/warp', so it is a ts example");
  for (const name of api) {
    if (new RegExp(`(?<![.\\w])${name}\\s*[(<]`).test(code)) problems.push(`calls ${name}, so it is a ts example`);
  }
  return problems;
};

export type Planned = { code: string; doc: string; line: number };

const docProblems = (doc: string, text: string, api: string[]) => [
  ...headerProblems(doc, text).map((problem) => `${doc}:1: ${problem}`),
  ...linkProblems(doc, text).map((problem) => `${doc}: ${problem}`),
  ...examplesIn(text)
    .filter((example) => !example.fragment)
    .flatMap((example) => configProblems(example.code).map((problem) => `${doc}:${example.line}: ${problem}`)),
  ...examplesIn(text)
    .filter((example) => example.fragment)
    .flatMap((example) =>
      fragmentProblems(doc, example.code, api).map((problem) => `${doc}:${example.line}: ${problem}`),
    ),
];

export const plan = (docs: { doc: string; text: string }[], api: string[]) => {
  const files = new Map<string, Planned>();
  for (const { doc, text } of docs) {
    for (const example of examplesIn(text).filter((e) => !e.fragment)) {
      const path = examplePath(example) ?? 'example.ts';
      const file = files.has(`${doc}/${path}`) ? `${doc}/example-${example.line}/${path}` : `${doc}/${path}`;
      files.set(file, { code: `${example.code}\nexport {};\n`, doc, line: example.line });
    }
  }
  return { files, problems: docs.flatMap(({ doc, text }) => docProblems(doc, text, api)) };
};

export const isConfig = (code: string): boolean => /^export default defineConfig\(/m.test(code);

export const configProblems = (code: string): string[] =>
  /(?<![.\w])archetype\s*\(/.test(code) && !isConfig(code)
    ? ['builds an archetype, so it is a whole config: end it with export default defineConfig(...)']
    : [];

export const located = (diagnostic: string, files: Map<string, Planned>): string => {
  const match = /^(\S+\.ts)\((\d+),\d+\): (.*)$/.exec(diagnostic);
  const source = match && files.get(match[1]);
  return source ? `${source.doc}:${source.line + Number(match[2]) - 1}: ${match[3]}` : diagnostic;
};

const loadProblems = async (files: Map<string, Planned>): Promise<string[]> => {
  const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { dirname, join } = await import('node:path');
  const { loadConfig } = await import('../src/config/loadConfig.ts');
  const { loadConfigData } = await import('../src/app/load.ts');
  const { builtinRegistry } = await import('../src/builtins/index.ts');
  const builtins = [...builtinRegistry.values()];
  const out = mkdtempSync(join(tmpdir(), 'warp-doc-configs-'));
  for (const [file, { code }] of files) {
    mkdirSync(dirname(join(out, file)), { recursive: true });
    writeFileSync(join(out, file), code);
  }
  const problems: string[] = [];
  for (const [file, { code, doc, line }] of files) {
    if (!isConfig(code)) continue;
    try {
      loadConfigData((await loadConfig(join(out, file))).raw, { builtins });
    } catch (error) {
      for (const message of String((error as Error).message).split('\n')) problems.push(`${doc}:${line}: ${message}`);
    }
  }
  rmSync(out, { recursive: true, force: true });
  return problems;
};

const main = async () => {
  const { execFileSync, spawnSync } = await import('node:child_process');
  const { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = await import('node:fs');
  const { dirname, resolve } = await import('node:path');
  const docs = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '*.md'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => file !== '' && !file.startsWith('fixtures/') && existsSync(file))
    .map((doc) => ({ doc, text: readFileSync(doc, 'utf8') }));
  const { files, problems } = plan(docs, valueExports(readFileSync('src/index.ts', 'utf8')));
  const out = 'node_modules/.cache/doc-examples';
  rmSync(out, { recursive: true, force: true });
  for (const [file, { code }] of files) {
    mkdirSync(dirname(`${out}/${file}`), { recursive: true });
    writeFileSync(`${out}/${file}`, code);
  }
  mkdirSync(out, { recursive: true });
  const tsconfig = {
    extends: '../../../tsconfig.json',
    compilerOptions: { paths: { '@yearofthedan/warp': [resolve('src/index.ts')] } },
  };
  writeFileSync(`${out}/tsconfig.json`, JSON.stringify({ ...tsconfig, include: ['**/*.ts'] }));
  const run = spawnSync('tsc', ['-p', 'tsconfig.json', '--pretty', 'false'], { cwd: out, encoding: 'utf8' });
  const diagnostics =
    run.status === 0 ? [] : `${run.stdout}${run.stderr}`.split('\n').filter((line) => line.trim() !== '');
  const failures = [...problems, ...diagnostics.map((line) => located(line, files))];
  if (diagnostics.length === 0) failures.push(...(await loadProblems(files)));
  for (const failure of failures) console.error(failure);
  console.log(
    `${docs.length} docs, ${files.size} ts examples type-checked and configs loaded, ${failures.length} problems.`,
  );
  process.exitCode = failures.length > 0 ? 1 : 0;
};

if (import.meta.main) await main();
