// Cloudflare 邊緣快取：同一個機房的所有訪客共用一份結果，證交所看到的請求量與人數無關
export async function edgeCached(ctx, key, ttlSeconds, load) {
  const cacheKey = new Request(new URL(`/__cache/${key}`, ctx.request.url).toString());
  const cache = caches.default;

  const hit = await cache.match(cacheKey).catch(() => null);
  if (hit) return json(await hit.text(), 200, 'HIT');

  try {
    const body = JSON.stringify(await load());
    const toStore = new Response(body, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttlSeconds}` },
    });
    ctx.waitUntil(cache.put(cacheKey, toStore).catch(() => {}));
    return json(body, 200, 'MISS');
  } catch (err) {
    return json(JSON.stringify({ error: String(err.message || err) }), 502, 'ERROR');
  }
}

function json(body, status, cacheStatus) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Edge-Cache': cacheStatus },
  });
}
