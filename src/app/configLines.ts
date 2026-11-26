import type { Finding } from '../domain/rules/rule.ts';

export type ConfigLines = ReadonlyMap<string, number>;

const ends = new Set([':', ' ', '-', '.', undefined]);

export const lineAt = (lines: ConfigLines, text: string): number | undefined => {
  const paths = [...lines.keys()].filter((path) => text.startsWith(path) && ends.has(text[path.length]));
  const longest = paths.sort((a, b) => b.length - a.length)[0];
  return longest === undefined ? undefined : lines.get(longest);
};

export const placeProblems = (lines: ConfigLines, file: string, message: string): string =>
  message
    .split('\n')
    .map((problem) => {
      const line = problem.startsWith(`${file}`) ? undefined : lineAt(lines, problem);
      return line === undefined ? problem : `${file}:${line}: ${problem}`;
    })
    .join('\n');

const site = /\b[\w-]+(?:\.[\w-]+)*\.(?:dependencies|exposes|requires|provides)\b/g;

const pointed = (lines: ConfigLines, file: string, message: string): string =>
  message.replace(site, (path) => {
    const line = lineAt(lines, path);
    return line === undefined ? path : `${path} (${file}:${line})`;
  });

export const placeFindings = (lines: ConfigLines, file: string, findings: Finding[]): Finding[] =>
  findings.map((finding) => {
    if (finding.file !== file) return { ...finding, message: pointed(lines, file, finding.message) };
    const line = lineAt(lines, finding.message);
    return line === undefined ? finding : { ...finding, line };
  });
