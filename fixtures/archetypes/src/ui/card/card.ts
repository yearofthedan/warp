import { format } from 'node:util';
import { order } from '../../domain/order.ts';

export const cardTotal = (): string => format('%d', order(2).total);
