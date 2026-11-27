import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

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

export const docProblems = (doc: string, text: string): string[] => [
  ...headerProblems(doc, text).map((problem) => `${doc}:1: ${problem}`),
  ...linkProblems(doc, text).map((problem) => `${doc}: ${problem}`),
];

const main = () => {
  const docs = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '*.md'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(
      (file) => file !== '' && !file.startsWith('fixtures/') && !file.endsWith('.approved.md') && existsSync(file),
    );
  const failures = docs.flatMap((doc) => docProblems(doc, readFileSync(doc, 'utf8')));
  for (const failure of failures) console.error(failure);
  console.log(`${docs.length} docs, ${failures.length} problems.`);
  process.exitCode = failures.length > 0 ? 1 : 0;
};

if (import.meta.main) main();
