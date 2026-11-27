import { components } from '../components.ts';
import type { ClassFacts, Member } from '../../domain/facts/facts.ts';
import { type FileRule, wholeNumberOptions } from '../../domain/rules/rule.ts';
import { group, type Group, withOrdinals } from '../shared.ts';

const defaults = { maxLines: 100 };

export const classCohesion: FileRule<typeof defaults> = {
  id: 'class-cohesion',
  defaults,
  parseOptions: wholeNumberOptions(defaults),
  check: ({ file, options }) =>
    withOrdinals(file.classes).flatMap(([cls, name]) => {
      const methods = statefulMethods(cls);
      const judged = methods.flat().reduce((sum, member) => sum + member.endLine - member.line + 1, 0);
      if (judged <= options.maxLines || methods.length <= 1) return [];
      const groups = methods.map(group);
      return [
        {
          rule: 'class-cohesion',
          key: `class-cohesion:${file.path}:${name}`,
          file: file.path,
          line: cls.line,
          value: groups.length,
          limit: 1,
          message:
            `Class ${cls.name} in ${file.path}:${cls.line} is ${cls.lines} lines, ${judged} of them in methods that use its state ` +
            `(tripwire ${options.maxLines}), and its methods fall into ${groups.length} groups that share no fields or calls: ` +
            `${groups.map(describe).join('; ')}. Each group can become its own class.`,
          details: { lines: cls.lines, judgedLines: judged, tripwire: options.maxLines, groups },
        },
      ];
    }),
};

const statefulMethods = (cls: ClassFacts): Member[][] =>
  components(cls.members, ['function'])
    .filter((members) => members.some((member) => member.kind === 'state'))
    .map((members) => members.filter((member) => member.kind === 'function'));

const describe = (g: Group): string => `[${g.names.join(', ')}] (lines ${g.lines[0]}-${g.lines[1]})`;
