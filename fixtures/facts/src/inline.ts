import shapes = require('./lib/shapes.ts');

declare const require: (specifier: string) => unknown;

export const later = () => import('./lib/index.ts');
export const legacy = () => require('./lib/shapes.ts');
export const quoted = () => import(`./lib/shapes.ts`);
export const computed = (name: string) => import(`./lib/${name}.ts`);
export const pad = () => import('left-pad');
export const gone = () => require('./lib/gone.ts');
export type Side = import('./lib/shapes.ts').Square['side'];
export const square = new shapes.Square();
