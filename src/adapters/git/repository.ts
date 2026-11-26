import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import type { ChangedLines, Repository } from '../../app/ports.ts';

export const gitRepository = (projectRoot: string): Repository => {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const top = realpathSync(git('rev-parse', '--show-toplevel'));
  const project = realpathSync(projectRoot);
  const projectPath = relative(top, project).split(sep).join('/');
  return {
    projectPath: () => projectPath,
    commit: (ref) => git('rev-parse', '--verify', `${ref}^{commit}`),
    mergeBase: (a, b) => git('merge-base', a, b),
    changedLines: (base, head) => changedLines(git, base, head),
    checkout(commit, requiredFile) {
      const scratch = mkdtempSync(join(tmpdir(), 'warp-'));
      const dir = join(scratch, 'tree');
      const dispose = () => rmSync(scratch, { recursive: true, force: true });
      try {
        exportTree(top, commit, scratch, dir);
        const root = join(dir, projectPath);
        if (!existsSync(join(root, requiredFile))) return { dispose };
        for (const from of new Set([project, top])) {
          const modules = join(from, 'node_modules');
          const to = join(dir, relative(top, from), 'node_modules');
          if (existsSync(modules) && !existsSync(to)) symlinkSync(modules, to, 'dir');
        }
        return { projectRoot: root, dispose };
      } catch (error) {
        dispose();
        throw error;
      }
    },
  };
};

const exportTree = (cwd: string, commit: string, scratch: string, dir: string) => {
  const env = { ...process.env, GIT_INDEX_FILE: join(scratch, 'index'), GIT_LFS_SKIP_SMUDGE: '1' };
  const git = (...args: string[]) => execFileSync('git', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  git('read-tree', commit);
  git('checkout-index', '--all', `--prefix=${dir}${sep}`);
};

export const projectPathOf = (projectRoot: string): string => {
  try {
    return gitRepository(projectRoot).projectPath();
  } catch {
    return '';
  }
};

const changedLines = (git: (...args: string[]) => string, base: string, head?: string): ChangedLines[] => {
  const range = head === undefined ? [base] : [base, head];
  const patch = git(
    'diff',
    '--unified=0',
    '--no-color',
    '--no-ext-diff',
    '--src-prefix=a/',
    '--dst-prefix=b/',
    '--relative',
    ...range,
    '--',
    '.',
  );
  const untracked = head === undefined ? git('ls-files', '--others', '--exclude-standard', '--', '.').split('\n') : [];
  return [
    ...addedLines(patch),
    ...untracked.filter(Boolean).map((file) => ({ file, from: 1, to: Number.POSITIVE_INFINITY })),
  ];
};

const addedLines = (patch: string): ChangedLines[] => {
  const lines: ChangedLines[] = [];
  let file: string | undefined;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++ ')) file = line === '+++ /dev/null' ? undefined : line.slice('+++ b/'.length);
    const hunk = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk || file === undefined) continue;
    const [from, count] = [Number(hunk[1]), Number(hunk[2] ?? 1)];
    if (count > 0) lines.push({ file, from, to: from + count - 1 });
  }
  return lines;
};
