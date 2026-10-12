import { NL_COMMON } from './nl/common';
import { NL_ORDERS } from './nl/orders';
import { NL_SETUP } from './nl/setup';
import { NL_STATIONS } from './nl/stations';
import { NL_STATS } from './nl/stats';

/** Dutch for every English text in the app, by the English text. */
export const NL: Record<string, string> = {
  ...NL_SETUP,
  ...NL_ORDERS,
  ...NL_STATIONS,
  ...NL_STATS,
  ...NL_COMMON,
};
