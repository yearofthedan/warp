import type { ExternalImport } from '../domain/facts/facts.ts';

const glob = (pattern: string): RegExp =>
  new RegExp(`^${pattern.replaceAll(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')}$`);

export const listsPackage = (pattern: string, external: Pick<ExternalImport, 'package' | 'specifier'>): boolean => {
  const matches = glob(pattern);
  return matches.test(external.package) || matches.test(external.specifier);
};
