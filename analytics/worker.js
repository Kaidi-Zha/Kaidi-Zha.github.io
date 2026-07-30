// Kaidi Zha — personal site analytics (Cloudflare Worker)
//
//   POST /collect          beacon endpoint used by assets/js/analytics.js
//   GET  /admin?token=...  private dashboard: views / visitors / IPs
//   cron (weekly, Monday)  email summary via Resend to REPORT_EMAIL
//
// Secrets (wrangler secret put ...): ADMIN_TOKEN, RESEND_API_KEY, REPORT_EMAIL
// Binding: D1 database as DB (see wrangler.toml + schema.sql)

const BOT_RE = /bot|crawler|spider|slurp|pingdom|headless|lighthouse|preview/i;

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra,
  };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function summarize(env, sinceIso) {
  const db = env.DB;
  const [totals, byDay, byPath, byCountry, topIps] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS views, COUNT(DISTINCT ip) AS visitors FROM visits WHERE ts >= ?')
      .bind(sinceIso).first(),
    db.prepare("SELECT substr(ts,1,10) AS day, COUNT(*) AS views, COUNT(DISTINCT ip) AS visitors FROM visits WHERE ts >= ? GROUP BY day ORDER BY day DESC")
      .bind(sinceIso).all(),
    db.prepare('SELECT path, COUNT(*) AS views FROM visits WHERE ts >= ? GROUP BY path ORDER BY views DESC LIMIT 15')
      .bind(sinceIso).all(),
    db.prepare("SELECT COALESCE(NULLIF(country,''),'—') AS country, COUNT(*) AS views FROM visits WHERE ts >= ? GROUP BY country ORDER BY views DESC LIMIT 15")
      .bind(sinceIso).all(),
    db.prepare("SELECT ip, COALESCE(country,'') AS country, COALESCE(city,'') AS city, COUNT(*) AS views, MAX(ts) AS last_seen FROM visits WHERE ts >= ? GROUP BY ip ORDER BY views DESC LIMIT 30")
      .bind(sinceIso).all(),
  ]);
  return {
    totals: totals || { views: 0, visitors: 0 },
    byDay: byDay.results, byPath: byPath.results,
    byCountry: byCountry.results, topIps: topIps.results,
  };
}

const PAGE_CSS = `body{font-family:-apple-system,'Segoe UI',sans-serif;background:#FAF8F5;color:#1C1410;max-width:880px;margin:40px auto;padding:0 20px}
h1{font-size:1.4rem} h2{font-size:1rem;margin:28px 0 8px;color:#C8603A;text-transform:uppercase;letter-spacing:.08em}
table{border-collapse:collapse;width:100%;font-size:.85rem;background:#fff}
td,th{border:1px solid #E2D9D0;padding:6px 10px;text-align:left}
th{background:#F3EEE8}.big{font-size:2rem;font-weight:700}
.cards{display:flex;gap:16px;margin:16px 0}.card{background:#fff;border:1px solid #E2D9D0;border-radius:8px;padding:14px 22px}
.card span{color:#7E6F67;font-size:.8rem}`;

function renderAdmin(data, recent, days) {
  const rows = (arr, cols) => arr.map(r =>
    '<tr>' + cols.map(c => `<td>${esc(typeof c === 'function' ? c(r) : r[c])}</td>`).join('') + '</tr>').join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Site Analytics</title><style>${PAGE_CSS}</style></head><body>
<h1>Kaidi-Zha.github.io — 近 ${days} 天</h1>
<div class="cards">
  <div class="card"><div class="big">${data.totals.views}</div><span>浏览量</span></div>
  <div class="card"><div class="big">${data.totals.visitors}</div><span>独立访客 (IP)</span></div>
</div>
<h2>按天</h2><table><tr><th>日期 (UTC)</th><th>浏览量</th><th>独立访客</th></tr>${rows(data.byDay, ['day','views','visitors'])}</table>
<h2>页面排行</h2><table><tr><th>路径</th><th>浏览量</th></tr>${rows(data.byPath, ['path','views'])}</table>
<h2>国家/地区</h2><table><tr><th>代码</th><th>浏览量</th></tr>${rows(data.byCountry, ['country','views'])}</table>
<h2>访客 IP（近 ${days} 天活跃）</h2><table><tr><th>IP</th><th>地区</th><th>浏览量</th><th>最近访问 (UTC)</th></tr>
${rows(data.topIps, ['ip', r => [r.country, r.city].filter(Boolean).join(' ') || '—', 'views', 'last_seen'])}</table>
<h2>最近 50 条访问</h2><table><tr><th>时间 (UTC)</th><th>路径</th><th>IP</th><th>地区</th><th>UA</th><th>来源</th></tr>
${rows(recent, ['ts','path','ip', r => [r.country, r.city].filter(Boolean).join(' '), r => String(r.ua).slice(0,60), r => String(r.referrer).slice(0,50)])}</table>
</body></html>`;
}

function renderReportEmail(data, rangeLabel) {
  const row = (a, b) => `<tr><td style="padding:4px 12px 4px 0;color:#7E6F67">${esc(a)}</td><td>${esc(b)}</td></tr>`;
  const ipRows = data.topIps.slice(0, 15).map(r =>
    `<tr><td style="padding:3px 12px 3px 0">${esc(r.ip)}</td><td style="padding:3px 12px 3px 0">${esc([r.country, r.city].filter(Boolean).join(' ') || '—')}</td><td>${r.views} 次</td></tr>`).join('');
  const pathRows = data.byPath.slice(0, 10).map(r =>
    `<tr><td style="padding:3px 12px 3px 0">${esc(r.path)}</td><td>${r.views} 次</td></tr>`).join('');
  return `<div style="font-family:-apple-system,'Segoe UI',sans-serif;color:#1C1410">
<h2 style="color:#C8603A">个人主页周报 · ${esc(rangeLabel)}</h2>
<table>${row('总浏览量', data.totals.views)}${row('独立访客（按 IP）', data.totals.visitors)}</table>
<h3>页面排行</h3><table>${pathRows || '<tr><td>本周无访问</td></tr>'}</table>
<h3>活跃访客 IP</h3><table>${ipRows || '<tr><td>本周无访问</td></tr>'}</table>
<p style="color:#7E6F67;font-size:.85rem">— 由你的 Cloudflare Worker 自动生成</p></div>`;
}

async function sendWeeklyReport(env) {
  if (!env.RESEND_API_KEY || !env.REPORT_EMAIL) {
    console.warn('weekly report skipped: RESEND_API_KEY / REPORT_EMAIL not set');
    return;
  }
  const since = new Date(Date.now() - 7 * 86400e3).toISOString();
  const data = await summarize(env, since);
  const rangeLabel = `${since.slice(0, 10)} ~ ${new Date().toISOString().slice(0, 10)} (UTC)`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Site Analytics <onboarding@resend.dev>',
      to: [env.REPORT_EMAIL],
      subject: `主页周报 ${rangeLabel}：${data.totals.views} 次浏览 / ${data.totals.visitors} 位访客`,
      html: renderReportEmail(data, rangeLabel),
    }),
  });
  if (!res.ok) console.error('resend failed:', res.status, await res.text());
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/collect') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
      if (request.method !== 'POST') return new Response('ok', { headers: corsHeaders() });
      const ua = (request.headers.get('User-Agent') || '').slice(0, 300);
      if (BOT_RE.test(ua)) return new Response('ok', { headers: corsHeaders() });
      let body = {};
      try { body = JSON.parse(await request.text()); } catch { /* ignore malformed */ }
      const cf = request.cf || {};
      await env.DB.prepare(
        'INSERT INTO visits (ts, path, referrer, ua, ip, country, city) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        new Date().toISOString(),
        String(body.p || '').slice(0, 200),
        String(body.r || '').slice(0, 500),
        ua,
        request.headers.get('CF-Connecting-IP') || '',
        cf.country || '',
        cf.city || '',
      ).run();
      return new Response('ok', { headers: corsHeaders() });
    }

    if (url.pathname === '/admin') {
      if (!env.ADMIN_TOKEN || url.searchParams.get('token') !== env.ADMIN_TOKEN) {
        return new Response('403 — append ?token=YOUR_ADMIN_TOKEN to the URL.', { status: 403 });
      }
      const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30', 10) || 30, 1), 365);
      const since = new Date(Date.now() - days * 86400e3).toISOString();
      const [data, recent] = await Promise.all([
        summarize(env, since),
        env.DB.prepare('SELECT ts, path, ip, country, city, ua, referrer FROM visits ORDER BY id DESC LIMIT 50').all(),
      ]);
      return new Response(renderAdmin(data, recent.results, days),
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    return new Response('not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendWeeklyReport(env));
  },
};
