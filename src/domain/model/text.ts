import type { ExposesData, RefData } from './data.ts';

export const packageText = (pattern: string): string =>
  pattern.startsWith('node:') || pattern.startsWith('virtual:') ? pattern : `npm:${pattern}`;

export const show = (ref: RefData): string =>
  ref.kind === 'package'
    ? packageText(ref.pattern)
    : `${ref.kind === 'module' && ref.top ? 'top.' : ''}${ref.kind === 'required' ? ref.name : ref.module}${ref.surface === undefined ? '' : `.${ref.surface}`}`;

export const exposesText = (exposes: ExposesData | undefined): string => {
  if (exposes === undefined) return 'nothing';
  if (exposes.kind === 'all') return 'all its files';
  if (exposes.kind === 'files') return `{ files: [${exposes.patterns.join(', ')}] }`;
  return Object.keys(exposes.surfaces).join(', ');
};
