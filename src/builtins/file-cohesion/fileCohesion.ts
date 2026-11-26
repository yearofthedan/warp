import { components } from '../components.ts';
import { type FileRule, wholeNumberOptions } from '../../domain/rules/rule.ts';
import { group, type Group } from '../shared.ts';

const defaults = { maxLines: 200 };

export const fileCohesion: FileRule<typeof defaults> = {
  id: 'file-cohesion',
  defaults,
  parseOptions: wholeNumberOptions(defaults),
  check: ({ file, options }) => {
    if (file.lines <= options.maxLines) return [];
    const groups = components(file.members, ['function', 'class', 'code']).map(group);
    if (groups.length <= 1) return [];
    return [
      {
        rule: 'file-cohesion',
        key: `file-cohesion:${file.path}`,
        file: file.path,
        line: 1,
        value: groups.length,
        limit: 1,
        message:
          `${file.path} is ${file.lines} lines (tripwire ${options.maxLines}) and its top-level code falls into ${groups.length} groups ` +
          `that share no calls, top-level state or types: ${groups.map(describe).join('; ')}. Each group can move to its own file.`,
        details: { lines: file.lines, tripwire: options.maxLines, groups },
      },
    ];
  },
};

const describe = (g: Group): string => `[${g.names.join(', ')}] (lines ${g.lines[0]}-${g.lines[1]})`;
