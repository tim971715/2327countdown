import { TTL, cached, fetchHolidays } from '../../lib/twse.js';
import { edgeCached } from '../../lib/edge.js';

const load = cached(() => TTL.holidays, fetchHolidays);

export const onRequestGet = ctx => edgeCached(ctx, 'holidays', TTL.holidays, load);
