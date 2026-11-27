export class Order {
  items: string[] = [];
  cancel(): void {}
}

export const strings = { header: { title: 'Orders' } };

export const total = (order: Order): number => order.items.length;

export interface Shipment {
  order: Order;
}
