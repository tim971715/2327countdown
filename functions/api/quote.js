import { cached, fetchQuote, quoteTtl } from '../../lib/twse.js';
import { edgeCached } from '../../lib/edge.js';

const load = cached(quoteTtl, fetchQuote);

export const onRequestGet = ctx => edgeCached(ctx, 'quote', quoteTtl(), load);
