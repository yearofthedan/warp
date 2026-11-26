import { noOptions, type FileRule } from '../../domain/rules/rule.ts';

const id = 'unresolved-import';

export const unresolvedImport: FileRule = {
  id,
  parseOptions: noOptions,
  check: ({ file }) =>
    file.unresolved.map(({ from, specifier, line }) => ({
      rule: id,
      key: `${id}:${from}->${specifier}`,
      file: from,
      line,
      value: 1,
      message: `${specifier} from ${from} resolves to no file. Fix the path, or add the file it names.`,
      details: { from, specifier },
    })),
};
