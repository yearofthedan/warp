import { order } from './order.ts';

export const checksTotal = (): boolean => order(1).total === 1;
