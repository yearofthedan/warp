export interface Order {
  total: number;
}

export const order = (total: number): Order => ({ total });
