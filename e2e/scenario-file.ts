export interface Scenario {
  stated: string;
  files: Map<string, string>;
  args: string[];
  cwd: string;
}

export interface Run {
  stdout: string;
  stderr: string;
  status: number;
}

const fence = /^```(.*)$/;

interface Block {
  info: string;
  body: string;
  end: number;
}

const blocksIn = (lines: readonly string[], path: string): Block[] => {
  const blocks: Block[] = [];
  let open: { info: string; start: number } | undefined;
  lines.forEach((line, index) => {
    const match = fence.exec(line);
    if (!match) return;
    if (open) {
      blocks.push({ info: open.info, body: lines.slice(open.start + 1, index).join('\n'), end: index });
      open = undefined;
    } else open = { info: match[1]!.trim(), start: index };
  });
  if (open) throw new Error(`${path}:${open.start + 1}: a code block is never closed`);
  return blocks;
};

const commandOf = (block: Block, path: string): { args: string[]; cwd: string } => {
  const words = block.body.trim().split(/\s+/);
  const cwd = words[0] === 'cd' && words[2] === '&&' ? words.splice(0, 3)[1]! : '.';
  const [tool, ...args] = words;
  if (tool !== 'warp' || block.body.trim().includes('\n'))
    throw new Error(`${path}: the sh block holds one warp command, such as: warp check, or cd src && warp check`);
  return { args, cwd };
};

const fileOf = (block: Block, files: Map<string, string>, path: string): void => {
  const [, file] = block.info.split(/\s+/);
  if (!file)
    throw new Error(`${path}:${block.end + 1}: a block before the command names its file, such as: ts src/a.ts`);
  if (files.has(file)) throw new Error(`${path}: ${file} is given twice`);
  files.set(file, `${block.body}\n`);
};

export const readScenario = (text: string, path: string): Scenario => {
  const lines = text.split('\n');
  const blocks = blocksIn(lines, path);
  const at = blocks.findIndex((block) => block.info === 'sh');
  if (at === -1) throw new Error(`${path}: has no sh block with the warp command to run`);
  const files = new Map<string, string>();
  for (const block of blocks.slice(0, at)) fileOf(block, files, path);
  if (!files.has('warp.yaml')) throw new Error(`${path}: gives no warp.yaml`);
  const command = blocks[at]!;
  return { stated: lines.slice(0, command.end + 1).join('\n'), files, ...commandOf(command, path) };
};

const block = (info: string, body: string) => `\n\`\`\`${info}\n${body}\n\`\`\`\n`;

export const printed = (scenario: Scenario, run: Run, root: string): string => {
  const clean = (text: string) => text.replaceAll(root, '<project>').trimEnd();
  const stdout = clean(run.stdout);
  const stderr = clean(run.stderr);
  return [
    `${scenario.stated}\n`,
    stdout && block('text stdout', stdout),
    stderr && block('text stderr', stderr),
    run.status !== 0 && block('text exit', String(run.status)),
  ]
    .filter(Boolean)
    .join('');
};
