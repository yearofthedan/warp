import { matchesGlob } from 'node:path';
import { ConfigError, type FileRule } from 'warp';

interface Options {
  ports: string[];
}

export const noPortsThroughApplication: FileRule<Options> = {
  id: 'no-ports-through-application',
  docs: 'https://example.com/rules/no-ports-through-application',
  defaults: { ports: ['src/application/ports/**'] },
  parseOptions: (raw, at) => {
    const { ports, ...rest } = raw;
    if (Object.keys(rest).length > 0) throw new ConfigError(`${at}: unknown key ${Object.keys(rest).join(', ')}`);
    if (ports === undefined) return {};
    if (!Array.isArray(ports) || !ports.every((glob) => typeof glob === 'string')) throw new ConfigError(`${at}.ports: expected a list of globs`);
    return { ports };
  },
  check: ({ file, options }) =>
    file.imports
      .filter((edge) => edge.via && options.ports.some((glob) => matchesGlob(edge.to, glob)))
      .map((edge) => ({
        rule: 'no-ports-through-application',
        key: `no-ports-through-application:${file.path}->${edge.to}`,
        file: file.path,
        line: edge.line,
        value: edge.names.length,
        message: `${file.path} reaches the port ${edge.to} through ${edge.via}. Call a use case instead of holding the port.`,
      })),
};

export default { rules: [noPortsThroughApplication] };
