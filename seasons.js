// NamiPow season history: real daily snow depth and snowfall from JMA weather stations near each
// mountain, for this season and the last six (Nov–Apr). Runs once a day on GitHub Actions.
// Writes seasons.json:
//   { at, stations: { id: { name, elev, lat, lon, km: {mountain: distance} } },
//     mountains: { key: stationId }, seasons: { stationId: { '2025-26': { 'MM-DD': [depthCm, snowfallCm] } } } }
'use strict';
const fs = require('fs');
const BASE = 'https://www.data.jma.go.jp/obd/stats/etrn/';
const PREC = 48; // Nagano
const MOUNTAINS = { happo: [36.697, 137.833], goryu: [36.665, 137.833], nozawa: [36.922, 138.444], shiga: [36.722, 138.469] };
const SEASONS = 7, MONTHS = [11, 12, 1, 2, 3, 4];
const log = [];
const say = (...a) => { const s = a.join(' '); console.log(s); log.push(s); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(u) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(u, { headers: { 'user-agent': 'NamiPow season chart (github.com/JT2063-prog/namipow-data)' }, signal: AbortSignal.timeout(20000) }); if (r.ok) return await r.text(); say('HTTP', r.status, u); }
    catch (e) { say('fetch failed', u, e.message); }
    await sleep(3000);
  }
  return null;
}
function km(a, b) { const R = 6371, r = x => x * Math.PI / 180, dLat = r(b[0] - a[0]), dLon = r(b[1] - a[1]); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }

// viewPoint('a','0398','白馬','ハクバ','36','41.7','137','51.8','703','1','1','1','1','1',...)
function stations(html) {
  const out = {};
  for (const m of html.matchAll(/viewPoint\(([^)]*)\)/g)) {
    const a = m[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
    const [type, block, name, , latD, latM, lonD, lonM, elev, ...flags] = a;
    if (!block || out[block]) continue;
    out[block] = { id: block, type, name, lat: +latD + latM / 60, lon: +lonD + lonM / 60, elev: +elev, flags: flags.slice(0, 6).join('') };
  }
  return Object.values(out);
}
const num = s => { const t = String(s).replace(/<[^>]*>/g, '').replace(/[)\]\s]/g, '').replace(/&nbsp;/g, ''); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null; };
// Daily table: the last two columns are snowfall (total) and deepest snow depth.
function daily(html) {
  const t = (html.match(/<table[^>]*id="tablefix1"[\s\S]*?<\/table>/) || [''])[0];
  const out = {};
  for (const row of t.matchAll(/<tr class="mtx"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const c = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1]);
    const day = num(c[0]); if (!day || c.length < 4) continue;
    out[day] = [num(c[c.length - 1]), num(c[c.length - 2])]; // [depth, snowfall]
  }
  return out;
}
async function main() {
  const prev = (() => { try { return JSON.parse(fs.readFileSync('seasons.json', 'utf8')); } catch (e) { return null; } })();
  const sel = await get(`${BASE}select/prefecture.php?prec_no=${PREC}&block_no=&year=&month=&day=&view=`);
  if (!sel) { say('no station list'); return finish(prev); }
  const all = stations(sel);
  say('stations', all.length, 'e.g.', JSON.stringify(all.slice(0, 2)));
  const snowy = all.filter(s => /白馬|野沢|山ノ内|志賀|信濃町|飯山|菅平|小谷|大町/.test(s.name));
  say('candidates', snowy.map(s => `${s.name}(${s.id},${s.type},${s.elev}m,${s.flags})`).join(' '));
  const pick = {}, used = {};
  for (const [k, p] of Object.entries(MOUNTAINS)) {
    const near = snowy.map(s => Object.assign({}, s, { d: km(p, [s.lat, s.lon]) })).sort((a, b) => a.d - b.d);
    say(k, 'nearest', near.slice(0, 4).map(s => `${s.name} ${s.d.toFixed(1)}km`).join(', '));
    // Use the nearest station that has a snow-depth sensor; test by reading one winter month.
    for (const s of near.slice(0, 4)) {
      if (used[s.id] === false) continue;
      if (used[s.id] === undefined) {
        const h = await get(`${BASE}view/daily_${s.type === 's' ? 's1' : 'a1'}.php?prec_no=${PREC}&block_no=${s.id}&year=2025&month=1&day=&view=`);
        const d = h ? daily(h) : {};
        used[s.id] = Object.values(d).some(v => v[0] != null);
        say('test', s.name, used[s.id] ? 'has snow depth' : 'no snow depth');
        await sleep(1200);
      }
      if (used[s.id]) { pick[k] = s; break; }
    }
  }
  const now = new Date(Date.now() + 9 * 3600e3); // JST
  const thisSeason = now.getUTCMonth() + 1 >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const seasons = (prev && prev.seasons) || {};
  const stationsOut = {};
  for (const s of new Set(Object.values(pick))) {
    stationsOut[s.id] = { name: s.name, elev: s.elev, lat: +s.lat.toFixed(4), lon: +s.lon.toFixed(4), type: s.type, km: {} };
    seasons[s.id] = seasons[s.id] || {};
    for (let y = thisSeason - SEASONS + 1; y <= thisSeason; y++) {
      const label = `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
      const S = seasons[s.id][label] = seasons[s.id][label] || {};
      for (const m of MONTHS) {
        const yr = m >= 8 ? y : y + 1;
        const key = (d) => `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const monthStart = Date.UTC(yr, m - 1, 1), monthEnd = Date.UTC(yr, m, 1);
        if (monthStart > now.getTime()) continue;
        const done = S[key(28)] !== undefined && monthEnd + 3 * 864e5 < now.getTime(); // finished months are kept
        if (done) continue;
        const h = await get(`${BASE}view/daily_${s.type === 's' ? 's1' : 'a1'}.php?prec_no=${PREC}&block_no=${s.id}&year=${yr}&month=${m}&day=&view=`);
        if (h) { const d = daily(h); for (const [day, v] of Object.entries(d)) if (v[0] != null || v[1] != null) S[key(day)] = v; }
        await sleep(1000);
      }
      say(s.name, label, Object.keys(S).length, 'days');
    }
  }
  for (const [k, s] of Object.entries(pick)) stationsOut[s.id].km[k] = +s.d.toFixed(1);
  const mountains = Object.fromEntries(Object.entries(pick).map(([k, s]) => [k, s.id]));
  if (!Object.keys(mountains).length) return finish(prev);
  fs.writeFileSync('seasons.json', JSON.stringify({ at: new Date().toISOString(), source: 'Japan Meteorological Agency (AMeDAS daily data)', stations: stationsOut, mountains, seasons }));
  finish();
}
function finish() { fs.writeFileSync('seasons-log.txt', log.join('\n') + '\n'); }
main().catch(e => { say('error', e.stack); finish(); });
