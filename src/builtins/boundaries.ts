import type { FileFacts, ImportEdge } from '../domain/facts/facts.ts';
import { ConfigError } from '../domain/errors/configError.ts';
import type { Model, ModuleView } from '../domain/model/resolve.ts';
import { wholeNumberOptions } from '../domain/rules/rule.ts';

const chain = (module: ModuleView): ModuleView[] => (module.parent ? [...chain(module.parent), module] : [module]);

export const within = (module: ModuleView | undefined, holder: ModuleView): boolean => {
  for (let at = module; at; at = at.parent) if (at === holder) return true;
  return false;
};

export const crossed = (from: ModuleView, to: ModuleView): ModuleView | undefined => {
  const [source, target] = [chain(from), chain(to)];
  const shared = target.findIndex((module, at) => module !== source[at]);
  if (shared !== -1) return target[shared];
  return source.length > target.length ? to : undefined;
};

export interface Use {
  file: string;
  edge: ImportEdge;
  name: string;
}

export const valueUses = (model: Model, files: readonly FileFacts[]): Use[] => {
  const production = new Set(files.map((file) => file.path).filter((path) => !model.isTest(path)));
  return files.flatMap(({ path, imports }) =>
    production.has(path)
      ? imports
          .filter((edge) => !edge.typeOnly && !edge.reExport && production.has(edge.to))
          .flatMap((edge) => edge.names.filter((name) => name !== '*').map((name) => ({ file: path, edge, name })))
      : [],
  );
};

export interface LimitOptions {
  max: number;
  ignore: string[];
}

export const limitOptions =
  (defaults: LimitOptions) =>
  (raw: Record<string, unknown>, at: string): Partial<LimitOptions> => {
    const { ignore, ...rest } = raw;
    const max = wholeNumberOptions({ max: defaults.max })(rest, at);
    if (ignore === undefined) return max;
    if (!Array.isArray(ignore) || ignore.some((entry) => typeof entry !== 'string'))
      throw new ConfigError(`${at}.ignore: expected a list of module names`);
    return { ...max, ignore: ignore as string[] };
  };

export const ignored = (model: Model, ids: readonly string[]): ModuleView[] =>
  model.modules.filter((module) => ids.includes(module.id));

export const listed = (items: readonly string[]): string =>
  items.length === 1 ? items[0]! : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
