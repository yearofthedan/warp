import { type FileRule, wholeNumberOptions } from '../../rules/rule.ts';
import { withOrdinals } from '../shared.ts';

const defaults = { max: 15 };

export const cognitiveComplexity: FileRule<typeof defaults> = {
  id: 'cognitive-complexity',
  defaults,
  parseOptions: wholeNumberOptions(defaults),
  check: ({ file, options }) =>
    withOrdinals(file.functions).flatMap(([fn, name]) => {
      if (!fn.complexity || fn.complexity.total <= options.max) return [];
      const top = [...fn.complexity.increments].sort((a, b) => b.amount - a.amount || a.line - b.line).slice(0, 3);
      return [
        {
          rule: 'cognitive-complexity',
          key: `cognitive-complexity:${file.path}:${name}`,
          file: file.path,
          line: fn.line,
          value: fn.complexity.total,
          limit: options.max,
          message:
            `Function ${fn.name} in ${file.path}:${fn.line} has cognitive complexity ${fn.complexity.total} (limit ${options.max}). ` +
            `The largest increments: ${top.map((i) => `${i.reason} at line ${i.line} (+${i.amount})`).join(', ')}.`,
          details: { increments: fn.complexity.increments },
        },
      ];
    }),
};
