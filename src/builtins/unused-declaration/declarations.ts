import type { ConfigData } from '../../model/archetype/data.ts';
import type { ModuleView } from '../../model/archetype/resolve.ts';
import type { Finding, ProjectContext } from '../../rules/rule.ts';

export const id = 'unused-declaration';

export type Layer = 'production' | 'test';

export type UnusedDeclaration =
  | { kind: 'grant'; declaredIn: string; layer: Layer; using: string; modules: string[] }
  | { kind: 'surface'; declaredIn: string; layer: Layer; exposes: string; modules: string[] }
  | { kind: 'empty'; declaredIn: string; layer: Layer; selector: string };

export type Context = Pick<ProjectContext<object>, 'config' | 'model' | 'verdicts' | 'project' | 'atModule'> & {
  held: ReadonlySet<ModuleView>;
};

export const holding = ({ model, project }: Omit<Context, 'held'>): ReadonlySet<ModuleView> => {
  const held = new Set<ModuleView>();
  for (const file of project.files) for (let at = model.moduleOf(file.path); at; at = at.parent) held.add(at);
  return held;
};

export const instancesOf = ({ model, held }: Context, archetype: string): ModuleView[] =>
  model.modules.filter((module) => module.archetype === archetype && held.has(module));

export const childrenNamed = ({ held }: Context, instances: readonly ModuleView[], name: string): ModuleView[] =>
  instances.flatMap((instance) => instance.children.filter((child) => child.name === name && held.has(child)));

export const named = (module: ModuleView): string => (module.id === '.' ? 'the root' : module.id);

export const within = (module: ModuleView | undefined, holder: ModuleView): boolean => {
  for (let at = module; at; at = at.parent) if (at === holder) return true;
  return false;
};

export const unused = (config: ConfigData, key: string, message: string, details: UnusedDeclaration): Finding => ({
  rule: id,
  key: `${id}:${details.kind}:${key}`,
  file: config.file,
  line: 1,
  value: 1,
  message,
  details,
});
