// 本機版：國巨 2327 目標價倒數看板（零相依，Node 20.11+）
// 部署到 Cloudflare Pages 時不會用到這支，那邊由 functions/api/* 代理證交所。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { TTL, cached, fetchHistory, fetchHolidays, fetchQuote, quoteTtl } from './lib/twse.js';

const PORT = Number(process.env.PORT) || 8327;
const ROOT = path.join(import.meta.dirname, 'public');

const getQuote = cached(quoteTtl, fetchQuote);
const getHistory = cached(() => TTL.history, fetchHistory);
const getHolidays = cached(() => TTL.holidays, fetchHolidays);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/quote') return send(res, 200, await getQuote());
    if (url.pathname === '/api/history') return send(res, 200, await getHistory());
    if (url.pathname === '/api/holidays') return send(res, 200, await getHolidays());
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const full = path.join(ROOT, path.normalize(file));
    if (!full.startsWith(ROOT)) return send(res, 403, 'forbidden', 'text/plain');
    fs.readFile(full, (err, buf) => {
      if (err) return send(res, 404, 'not found', 'text/plain');
      send(res, 200, buf, MIME[path.extname(full)] || 'application/octet-stream');
    });
  } catch (err) {
    console.error(new Date().toISOString(), err.message);
    send(res, 502, { error: String(err.message || err) });
  }
}).listen(PORT, () => {
  console.log(`宜瑾姐的國巨復仇之路：http://localhost:${PORT}`);
});
