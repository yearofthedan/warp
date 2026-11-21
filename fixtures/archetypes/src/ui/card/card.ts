import { order } from '../../domain/order.ts';

export const cardTotal = (): number => order(2).total;
