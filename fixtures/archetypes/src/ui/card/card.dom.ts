import { cardTotal } from './card.ts';
import { title } from '../strings/en.ts';

export const renderCard = (): string => `${title}: ${cardTotal()}`;
