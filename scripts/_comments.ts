import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { SyntaxKind } from 'typescript/ast';
import { createScanner } from 'typescript/ast/scanner';

export type Comment = { line: number; lines: string[] };
export type Syntax = 'script' | 'hash' | 'css' | 'markup' | 'markdown' | 'none';
export type Verdict = { line: number; problems: string[]; review?: string };

const byName: Record<string, Syntax> = {
  LICENSE: 'none',
  '.node-version': 'none',
  '.gitignore': 'hash',
  do: 'hash',
};

const byExtension: Record<string, Syntax> = {
  ts: 'script',
  mts: 'script',
  cts: 'script',
  js: 'script',
  mjs: 'script',
  cjs: 'script',
  json: 'script',
  sh: 'hash',
  yml: 'hash',
  yaml: 'hash',
  css: 'css',
  svg: 'markup',
  html: 'markup',
  md: 'markdown',
  txt: 'none',
};

const byDirectory: [RegExp, Syntax][] = [
  [/^scripts\/[^/.]+$/, 'hash'],
  [/^\.vite-hooks\/[^/.]+$/, 'hash'],
  [/^acceptance\/[^/]+\/source$/, 'none'],
];

export const syntaxOf = (path: string): Syntax | undefined => {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const extension = name.includes('.', 1) ? name.slice(name.lastIndexOf('.') + 1) : '';
  return byName[name] ?? byExtension[extension] ?? byDirectory.find(([pattern]) => pattern.test(path))?.[1];
};

const lineOf = (text: string, offset: number) => text.slice(0, offset).split('\n').length;
const ownLine = (text: string, start: number) =>
  /^[ \t]*$/.test(text.slice(text.lastIndexOf('\n', start - 1) + 1, start));

const blockLines = (body: string) =>
  body.split('\n').map((line) =>
    line
      .trim()
      .replace(/^\*(?!\/)\s?/, '')
      .trim(),
  );

const regexKeywords = new Set([
  SyntaxKind.ReturnKeyword,
  SyntaxKind.TypeOfKeyword,
  SyntaxKind.CaseKeyword,
  SyntaxKind.InKeyword,
  SyntaxKind.OfKeyword,
  SyntaxKind.DeleteKeyword,
  SyntaxKind.VoidKeyword,
  SyntaxKind.ThrowKeyword,
  SyntaxKind.NewKeyword,
  SyntaxKind.YieldKeyword,
  SyntaxKind.AwaitKeyword,
  SyntaxKind.InstanceOfKeyword,
  SyntaxKind.ElseKeyword,
  SyntaxKind.DoKeyword,
]);
const endsOperand = new Set([
  SyntaxKind.CloseParenToken,
  SyntaxKind.CloseBracketToken,
  SyntaxKind.CloseBraceToken,
  SyntaxKind.PlusPlusToken,
  SyntaxKind.MinusMinusToken,
]);
const regexMayStart = (previous: SyntaxKind | undefined) =>
  previous === undefined ||
  regexKeywords.has(previous) ||
  (previous >= SyntaxKind.FirstPunctuation && previous <= SyntaxKind.LastPunctuation && !endsOperand.has(previous));

type Scanner = ReturnType<typeof createScanner>;
const trivia = new Set([SyntaxKind.WhitespaceTrivia, SyntaxKind.NewLineTrivia]);
const commentKinds = new Set([SyntaxKind.SingleLineCommentTrivia, SyntaxKind.MultiLineCommentTrivia]);

const rescanned = (scanner: Scanner, kind: SyntaxKind, previous: SyntaxKind | undefined, braces: boolean[]) => {
  const slash = kind === SyntaxKind.SlashToken || kind === SyntaxKind.SlashEqualsToken;
  if (slash && regexMayStart(previous)) return scanner.reScanSlashToken();
  if (kind === SyntaxKind.CloseBraceToken && braces.pop() === true) return scanner.reScanTemplateToken(false);
  return kind;
};

const commentRanges = (text: string) => {
  const scanner = createScanner(false, undefined, text);
  const ranges: { pos: number; end: number; single: boolean }[] = [];
  const braces: boolean[] = [];
  let previous: SyntaxKind | undefined;
  for (let next = scanner.scan(); next !== SyntaxKind.EndOfFile; next = scanner.scan()) {
    const kind = rescanned(scanner, next, previous, braces);
    if (kind === SyntaxKind.OpenBraceToken) braces.push(false);
    if (kind === SyntaxKind.TemplateHead || kind === SyntaxKind.TemplateMiddle) braces.push(true);
    if (commentKinds.has(kind)) {
      const single = kind === SyntaxKind.SingleLineCommentTrivia;
      ranges.push({ pos: scanner.getTokenStart(), end: scanner.getTokenEnd(), single });
    } else if (!trivia.has(kind)) previous = kind;
  }
  return ranges;
};

const scriptComments = (text: string): Comment[] => {
  const comments: Comment[] = [];
  let previous: { single: boolean; own: boolean; line: number } | undefined;
  for (const range of commentRanges(text)) {
    const raw = text.slice(range.pos, range.end);
    const line = lineOf(text, range.pos);
    const own = ownLine(text, range.pos);
    if (range.single) {
      const body = raw.replace(/^\/\/\/?\s?/, '').trim();
      if (previous?.single && previous.own && own && previous.line === line - 1) comments.at(-1)?.lines.push(body);
      else comments.push({ line, lines: [body] });
    } else {
      comments.push({ line, lines: blockLines(raw.slice(2, -2)) });
    }
    previous = { single: range.single, own, line: lineOf(text, range.end) };
  }
  return comments;
};

const hashStart = (line: string) => {
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quote) {
      if (char === '\\' && quote === '"') i++;
      else if (char === quote) quote = '';
    } else if (char === "'" || char === '"') quote = char;
    else if (char === '#' && (i === 0 || /\s/.test(line[i - 1]))) return i;
  }
  return -1;
};

const hashComments = (text: string): Comment[] => {
  const comments: Comment[] = [];
  let previousOwn = -1;
  text.split('\n').forEach((line, index) => {
    const number = index + 1;
    if (line.startsWith('#!')) return;
    const start = hashStart(line);
    if (start < 0) return;
    const body = line.slice(start + 1).trim();
    const own = line.slice(0, start).trim() === '';
    if (own && previousOwn === number - 1) comments.at(-1)?.lines.push(body);
    else comments.push({ line: number, lines: [body] });
    previousOwn = own ? number : -1;
  });
  return comments;
};

const delimited = (text: string, open: string, close: string): Comment[] => {
  const comments: Comment[] = [];
  for (let start = text.indexOf(open); start >= 0; start = text.indexOf(open, start + open.length)) {
    const end = text.indexOf(close, start + open.length);
    const body = text.slice(start + open.length, end < 0 ? undefined : end);
    comments.push({ line: lineOf(text, start), lines: blockLines(body) });
    if (end < 0) break;
    start = end;
  }
  return comments;
};

const outsideFences = (text: string) =>
  text
    .split('\n')
    .map((line, index, lines) => {
      const fencesBefore = lines.slice(0, index).filter((l) => /^\s*```/.test(l)).length;
      return fencesBefore % 2 === 1 || /^\s*```/.test(line) ? '' : line;
    })
    .join('\n');

export const commentsIn = (text: string, syntax: Syntax): Comment[] => {
  switch (syntax) {
    case 'script':
      return scriptComments(text);
    case 'hash':
      return hashComments(text);
    case 'css':
      return delimited(text, '/*', '*/');
    case 'markup':
      return delimited(text, '<!--', '-->');
    case 'markdown':
      return delimited(outsideFences(text), '<!--', '-->');
    case 'none':
      return [];
  }
};

const markers: [RegExp, RegExp][] = [
  [/^scripts\/[^/.]+$/, /^help: \S/],
  [/^\.github\/workflows\//, /^v\d+(\.\d+)*$/],
  [/\.test\.ts$/, /^@ts-expect-error \S/],
];

const directive =
  /^(@ts-(expect-error|ignore|nocheck|check)|(oxlint|eslint)-(disable|enable)(-next-line|-line)?|prettier-ignore|oxfmt-ignore|biome-ignore|shellcheck |Stryker (disable|restore)|[cv]8 ignore|istanbul ignore|<reference )/;

const softNever =
  /\b(never|n\/a|tbd|todo|forever|ever|someday|eventually|maybe|perhaps|whenever|if|unless|unknown|always|tbc|needed)\b|^(-+|\?+|none|na|later|soon)$/i;

const checkable = [
  /(^|\s)([\w.-]+\/[\w.-]+)?#\d+\b/,
  /https?:\/\/\S+/,
  /(^|\s)@?[\w./-]+@\d+(\.\d+)*/,
  /\b\d{4}-\d{2}-\d{2}\b/,
];

const maxLength = 120;

const isMarker = (path: string, lines: string[]) =>
  lines.length === 1 && markers.some(([file, marker]) => file.test(path) && marker.test(lines[0]));

const shapeProblems = (lines: string[], whys: string[], untils: string[]) => {
  const prose = lines.filter((line) => !line.startsWith('why:') && !line.startsWith('until:') && !directive.test(line));
  return [
    whys.length === 1 ? '' : `needs one why: line, has ${whys.length}`,
    untils.length === 1 ? '' : `needs one until: line, has ${untils.length}`,
    prose.length === 0 ? '' : `holds lines other than why:, until: and directives: "${prose[0]}"`,
    ...[...whys, ...untils].map((line) =>
      line.length > maxLength ? `${line.slice(0, line.indexOf(':'))}: runs past ${maxLength} characters` : '',
    ),
    ...whys.map((line) => (line.slice(4).trim() === '' ? 'why: is empty' : '')),
  ].filter((problem) => problem !== '');
};

const untilVerdict = (until: string): { problem?: string; review?: string } => {
  if (until === '') return { problem: 'until: is empty' };
  if (softNever.test(until)) return { problem: `until: names no point it ends: "${until}"` };
  return checkable.some((pattern) => pattern.test(until)) ? {} : { review: until };
};

export const judge = (path: string, comment: Comment): Verdict | undefined => {
  const lines = comment.lines.filter((line) => line !== '');
  if (isMarker(path, lines)) return undefined;
  const whys = lines.filter((line) => line.startsWith('why:'));
  const untils = lines.filter((line) => line.startsWith('until:'));
  const verdicts = untils.map((line) => untilVerdict(line.slice(6).trim()));
  const problems = [...shapeProblems(lines, whys, untils), ...verdicts.flatMap((v) => (v.problem ? [v.problem] : []))];
  const review = verdicts.find((v) => v.review !== undefined)?.review;
  if (problems.length === 0 && review === undefined) return undefined;
  return { line: comment.line, problems, review };
};

export const report = (file: string, text: string | undefined) => {
  const syntax = syntaxOf(file);
  if (syntax === undefined || text === undefined) {
    return {
      count: 0,
      reviews: [],
      failures: [`${file}: no comment syntax is known for it; add one to scripts/_comments.ts`],
    };
  }
  const comments = commentsIn(text, syntax);
  const verdicts = comments.flatMap((comment) => judge(file, comment) ?? []);
  return {
    count: comments.length,
    reviews: verdicts.flatMap((v) => (v.review === undefined ? [] : [`${file}:${v.line}: until: "${v.review}"`])),
    failures: verdicts.flatMap((v) => v.problems.map((problem) => `${file}:${v.line}: ${problem}`)),
  };
};

const main = () => {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => file !== '' && existsSync(file));
  const reports = files.map((file) => report(file, syntaxOf(file) && readFileSync(file, 'utf8')));
  const reviews = reports.flatMap((r) => r.reviews);
  const failures = reports.flatMap((r) => r.failures);
  const count = reports.reduce((sum, r) => sum + r.count, 0);
  for (const review of reviews) console.log(`review ${review}`);
  for (const failure of failures) console.error(failure);
  console.log(`${count} comments, ${reviews.length} with an until: to check by hand, ${failures.length} problems.`);
  process.exitCode = failures.length > 0 ? 1 : 0;
};

if (import.meta.main) main();
