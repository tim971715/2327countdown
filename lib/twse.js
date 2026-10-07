// 證交所資料抓取（Cloudflare Pages Functions 與本機 server.js 共用，只用 Web 標準 API）
export const STOCK = '2327';

// 快取秒數：盤中 5 秒（MIS 本身約 5 秒撮合一次），盤後 60 秒；日線 30 分鐘
export const TTL = { quoteOpen: 5, quoteClosed: 60, history: 1800, holidays: 86400 };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

// Cloudflare 跑在 UTC，所有日期時間一律換成台北時間判斷
export function taipeiNow(date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei', hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(date).map(x => [x.type, x.value])
  );
  return { year: +p.year, month: +p.month, ymd: `${p.year}${p.month}${p.day}`, hm: +p.hour * 100 + +p.minute, weekday: p.weekday };
}

// 上一筆報價的資料日期不是今天 → 今天休市（國定假日），不必盤中頻率輪詢
let quoteIsToday = true;

export function isSessionTime() {
  const t = taipeiNow();
  if (t.weekday === 'Sat' || t.weekday === 'Sun') return false;
  if (t.hm >= 900 && !quoteIsToday) return false;
  return t.hm >= 830 && t.hm <= 1335; // 含 8:30 試撮與 13:30 收盤集合競價
}

export const quoteTtl = () => (isSessionTime() ? TTL.quoteOpen : TTL.quoteClosed);

// 同一 isolate / 行程內：同時只打一次上游，其餘請求共用；上游失敗時回傳舊資料並標記 stale
export function cached(ttlSeconds, loader) {
  let value = null, at = 0, inflight = null;
  return async () => {
    if (value && Date.now() - at < ttlSeconds() * 1000) return value;
    if (!inflight) {
      inflight = loader()
        .then(v => { value = v; at = Date.now(); return v; })
        .finally(() => { inflight = null; });
    }
    try {
      return await inflight;
    } catch (err) {
      if (value) return { ...value, stale: true, error: String(err.message || err) };
      throw err;
    }
  };
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

const num = s => {
  const n = parseFloat(String(s ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export async function fetchQuote() {
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${STOCK}.tw&json=1&delay=0&_=${Date.now()}`;
  const j = await getJson(url);
  const m = j.msgArray && j.msgArray[0];
  if (!m) throw new Error(`MIS 無資料：${j.rtmessage || ''}`);
  quoteIsToday = m.d === taipeiNow().ymd;
  const bids = String(m.b || '').split('_').map(num).filter(Boolean);
  const asks = String(m.a || '').split('_').map(num).filter(Boolean);
  // z 是本輪撮合價，'-' 表示這 5 秒沒成交 → 退回最後一筆成交，再退回買賣中價，最後才用昨收
  let price = num(m.z), source = 'trade';
  if (!price && m.trade) price = num(m.trade.z);
  if (!price && bids[0] && asks[0]) { price = (bids[0] + asks[0]) / 2; source = 'mid'; }
  if (!price) { price = num(m.y); source = 'prevClose'; }
  return {
    code: m.c, name: (m.n || '').replace('*', ''), fullName: m.nf,
    date: m.d, time: m.t || m['%'],
    price, source,
    prevClose: num(m.y), open: num(m.o), high: num(m.h), low: num(m.l),
    limitUp: num(m.u), limitDown: num(m.w),
    volume: Number(m.v) || 0, // 張
    bids, asks,
    session: isSessionTime(),
    fetchedAt: Date.now(),
  };
}

export async function fetchHistory() {
  const t = taipeiNow();
  const months = [];
  for (let k = 2; k >= 0; k--) {
    const d = new Date(Date.UTC(t.year, t.month - 1 - k, 1));
    months.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}01`);
  }
  const rows = [];
  for (const ym of months) {
    const j = await getJson(`https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${ym}&stockNo=${STOCK}`);
    for (const r of j.data || []) {
      const [y, mo, da] = r[0].split('/');
      const close = num(r[6]);
      if (!close) continue;
      rows.push({
        date: `${Number(y) + 1911}-${mo}-${da}`,
        open: num(r[3]), high: num(r[4]), low: num(r[5]), close,
        volume: Math.round((num(r[1]) || 0) / 1000),
      });
    }
    await new Promise(r => setTimeout(r, 400)); // 證交所對短時間連打很敏感，間隔一下
  }
  return { rows, fetchedAt: Date.now() };
}

// 證交所休市日：今年與明年（明年的通常年底才公布，未公布時回傳空陣列）
export async function fetchHolidays() {
  const { year } = taipeiNow();
  const closed = [], years = [];
  for (const y of [year, year + 1]) {
    const j = await getJson(`https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?response=json&date=${y}0101`);
    const data = j.data || [];
    if (data.length) years.push(y);
    // 「開始交易日」「最後交易日」是有開盤的日子，其餘（含「市場無交易，僅辦理結算交割」）都休市
    for (const [date, name] of data) if (!/開始交易|最後交易/.test(name)) closed.push({ date, name });
    await new Promise(r => setTimeout(r, 400));
  }
  return { closed, years, fetchedAt: Date.now() };
}
