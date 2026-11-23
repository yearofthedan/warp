import { noOptions, type ProjectRule } from '../../rules/rule.ts';
import { holding, id } from './declarations.ts';
import { emptyModules } from './empty.ts';
import { unusedGrants } from './grants.ts';
import { unusedSurfaces } from './surfaces.ts';

export const unusedDeclaration: ProjectRule = {
  id,
  scope: 'project',
  parseOptions: noOptions,
  check: (project) => {
    const context = { ...project, held: holding(project) };
    return [...unusedGrants(context), ...unusedSurfaces(context), ...emptyModules(context)];
  },
};
