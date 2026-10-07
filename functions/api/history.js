import { TTL, cached, fetchHistory } from '../../lib/twse.js';
import { edgeCached } from '../../lib/edge.js';

const load = cached(() => TTL.history, fetchHistory);

export const onRequestGet = ctx => edgeCached(ctx, 'history', TTL.history, load);
