import * as orders from './lib/orders.ts';
import { strings, total } from './lib/orders.ts';
import type { Order, Shipment } from './lib/orders.ts';

export const cancel = (order: Order): void => order.cancel();

export const title = (): string => strings.header.title;

export const ship = (shipment: Shipment): number => total(shipment.order);

export const named = (order: Order): number => orders.total(order);

export const passed = () => ({ strings });

const local = { count: 1 };
export const counted = (): number => local.count;
