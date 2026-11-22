import { equal } from 'node:assert/strict';
import { order } from './order.ts';

export const checksTotal = (): void => equal(order(1).total, 1);
