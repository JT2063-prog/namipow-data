// Happo-one, Goryu and Hakuba47 live lift status from the Hakuba Valley site (lifts only; no run status is published).
'use strict';
const PAGES = { happo: 'happo', goryu: 'goryu', h47: 'hakuba47' };
const norm = s => String(s || '').replace(/<[^>]*>/g, '').replace(/[（(].*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
const status = t => /closed|suspend|stop|運休|終了/i.test(t) ? 'closed' : /hold|stand|wait|prepar|delay|準備|待/i.test(t) ? 'standby' : /open|operat|運行/i.test(t) ? 'open' : null;
function parseLifts(html) {
  const out = {};
  const table = (html.match(/<table[^>]*id="y-lift-table"[\s\S]*?<\/table>/) || [''])[0];
  for (const m of table.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g)) {
    const name = norm(m[1]); if (!name || name in out) continue;   // first row wins (day status, not night/sunrise)
    out[name] = status(m[2].replace(/<[^>]*>/g, ''));
  }
  return out;
}
// Weather & snow report table: Area | Weather | Temperature | Snow Depth | today's snowfall | Total | Condition
const JA = { 'アルプス平': ['Alps-daira', 1515], '黒菱': ['Kurobishi', 1680], '兎平': ['Usagidaira', 1400], '八方池山荘': ['Happo-ike', 1830], '山頂': ['Summit', null], '山麓': ['Base', null], 'とおみ': ['Toomi', 760], 'いいもり': ['Iimori', 820] };
function parseDepth(html) {
  const t = (html.match(/<table[^>]*>(?:(?!<\/table>)[\s\S])*?Snow Depth[\s\S]*?<\/table>/i) || [''])[0];
  const out = [];
  for (const m of t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const c = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1].replace(/<[^>]*>/g, '').trim());
    if (c.length < 5) continue;
    const num = v => /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null;
    const [en, elev] = JA[c[0]] || [c[0], null];
    out.push({ name: en, elev, cm: num(c[3]), today: num(c[4]), temp: num(c[2]) });
  }
  const upd = (html.match(/WEATHER&(?:amp;)?SNOW REPORT[\s\S]{0,200}?(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2})/) || [])[1] || null;
  return out.map(x => Object.assign(x, { updated: upd }));
}
let cache = null, cacheAt = 0;
async function getHakuba() {
  if (cache && Date.now() - cacheAt < 10 * 60e3) return cache;
  const res = { at: new Date().toISOString() };
  await Promise.all(Object.entries(PAGES).map(async ([k, slug]) => {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 12e3);
    try {
      const r = await fetch(`https://www.hakubavalley.com/en/weather_en/detail_${slug}_en/`, { signal: ac.signal, headers: { 'user-agent': 'Mozilla/5.0 NamiPow' } });
      if (r.ok) { const html = await r.text(); res[k] = parseLifts(html); res[k + 'Depth'] = parseDepth(html); } else { res[k] = (cache && cache[k]) || {}; res[k + 'Depth'] = (cache && cache[k + 'Depth']) || []; }
    } catch (e) { console.log('[nami] hakuba status failed:', k, e.message); res[k] = (cache && cache[k]) || {}; res[k + 'Depth'] = (cache && cache[k + 'Depth']) || []; }
    finally { clearTimeout(t); }
  }));
  cache = res; cacheAt = Date.now(); return cache;
}
module.exports = { getHakuba, parseLifts, parseDepth, norm };
