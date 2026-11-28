import { unit } from '../lib/shapes.ts';

export const one = unit;
export function two() {
  return 2;
}
const three = 3;
export { three, three as tres };
export type Four = 4;
export default function five() {
  return 5;
}
