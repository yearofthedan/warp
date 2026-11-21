import { order } from './domain/index.ts';
import { renderCard } from './ui/card/card.dom.ts';

export const main = (): string => `${renderCard()} of ${order(1).total}`;
