// Shiga Kogen lifts and runs. Live from the official feed that powers shigakogen-ski.or.jp/lift/,
// with a bundled snapshot (17 Nov 2026) if the feed is down. Gradients come from official course data
// (see the project's shiga_kogen_runs_vs_nozawa.md) and SURF&SNOW averages; the feed has none.
'use strict';
const fs = require('fs');
const path = require('path');
const FEED = 'https://system.shigakogen.gr.jp/api/lift/';
const GRAD = {"Sun Valley A + Polar Bear Course": [18, 30], "Sun Valley B + Main Course": [12, 25], "Maruike A Course": [27, 32], "Maruike B Course": [24, 28], "Maruike C Course": [16, 18], "Hasuike A Course": [10, 15], "Hasuike B Course": [11, 16], "Giant Gelende": [20, 34], "Bunadaira Gelende": [15, 25], "World Cup Course (Upper section)": [15, 28], "World Cup Course (Lower section)": [15, 28], "Nishitateyama Beginner Course (Upper section)": [9, 18], "Nishitateyama Beginner Course (Lower section)": [9, 18], "Higashitateyama Olympic Course (Upper section)": [20, 36], "Higashitateyama Olympic Course (Middle section)": [20, 36], "Higashitateyama Olympic Course (Lower section)": [20, 36], "Higashitateyama Forest Course": [10, 12], "Eternal Course": [12, 20], "Philosophy Course": [16, 23], "LIPS Course": [15, 30], "Takamagahara Mammoth Gelende (Upper section)": [10, 25], "Takamagahara Mammoth Gelende (Lower section)": [10, 25], "Tanne no Mori Okojo Gelende": [10, 12], "Ichinose Family Front Gelende (Upper section)": [15, 26], "Ichinose Family Front Gelende (Lower section)": [15, 26], "Tengu Course": [10, 13], "Panorama Course": [16, 18], "Perfecter Course": [26, 30], "Diamond Gelende": [12, 21], "Rabbit Course": [9, 14], "Monkey Course": [8, 15], "Kamoshika Course": [8, 15], "A1 Giant Slalom Course": [11, 25], "B1 Panorama Course": [10, 25], "A4 Olympic Course": [23, 31], "A5 Yakebi Wall": [29, 39], "A2 No. 1 Gondola Connection Course": [9, null], "A3 Gondola Detour Course": [15, null], "A6 Super Giant Slalom Course": [10, null], "A7 Yakebi Valley": [16, null], "B2 Panorama In Course": [11, null], "C1 Karamatsu Course": [11, null], "C2 Shirakaba Course": [9, null], "C3 Buna Course": [11, null], "C4 YAKEBI COAST": [13, null], "D1 Middle Connection Course": [10, null], "D2 East Course": [11, null], "D3 Middle Course": [18, 25], "D4 East Connection Course": [6, null], "E1 South Course": [9, null], "E2 South Connection Course": [6, null], "O1 Okushiga Connection Course": [12, null], "1st Gelende": [6, null], "2nd Expert": [23, 30], "3rd Gelende": [13, null], "4th Gelende": [12, null], "6th Gelende": [8, null], "Downhill Course": [19, 28], "Hill Side Course": [10, 17], "Kumaotoshi Course": [20, 30], "Rinkan Course": [10, 17], "Kids Rinkan Course": [6, null], "Kumanoyu 3rd A Course": [null, 32]};
// Lift status codes as the official page decodes them. Course codes 5 and 6 are shown as Standby and Closed;
// lower course codes are treated as open (to be confirmed once the season starts).
const LIFT = { 1: 'open', 2: 'closed', 3: 'standby', 4: 'closed', 5: 'standby' };
const RUN = c => c === 6 ? 'closed' : c === 5 ? 'standby' : c ? 'open' : null;
const tidy = s => String(s || '').replace(/（/g, ' (').replace(/）/g, ')').replace(/\s+/g, ' ').replace('Sibutoge', 'Shibutoge').replace('Biginner', 'Beginner').replace('4rd', '4th').trim();
const AREA = s => tidy(s).replace(/ SKI AREA$/i, '').toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase()).replace('Nishidateyama', 'Nishidateyama').replace('Okushiga Kogen', 'Okushiga Kogen');
function liftType(name, type) {
  if (/gondola/i.test(type)) return 'gondola';
  if (/hood/i.test(name + type)) return 'hooded';
  if (/quad/i.test(type)) return 'quad';
  if (/triple/i.test(type)) return 'triple';
  if (/single/i.test(type)) return 'single';
  return 'pair';
}
const grade = (lv, max) => lv >= 3 ? (max >= 35 ? 'e' : 'a') : lv === 2 ? 'i' : 'b';
const ugText = /ungroomed|bump|mogul/i;
function run(name, lv, len, note, status) {
  const g = GRAD[name] || [];
  return { name, g: grade(lv, g[1] || 0), len: len || null, avg: g[0] || null, max: g[1] || null, ug: ugText.test(note || ''), note: note || '', status };
}
function fromSnapshot() {
  const s = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'shiga_snapshot.json'), 'utf8'));
  return { at: null, live: false, areas: s.areas.map(a => ({ name: a.n, hi: a.hi, lo: a.lo,
    lifts: a.L.map(l => ({ name: l[0], type: liftType(l[0], l[1]), len: l[2], hours: l[3] || '', status: null })),
    runs: a.C.map(c => run(c[0], c[1], c[2], c[3], null)) })) };
}
function normalise(feed, snap) {
  // Keep the snapshot's tidy names and notes; take lengths, levels and status from the feed.
  const byId = new Map((snap.areas || []).map((a, i) => [i + 1, a]));
  const areas = feed.map(a => {
    const s = byId.get(Number(a.id)) || {};
    const sRuns = new Map((s.runs || []).map(r => [r.name.toLowerCase(), r]));
    const runs = (a.course || []).filter(c => Number(c.length) > 0 || sRuns.has(tidy(c.name && c.name.en).toLowerCase())).map(c => {
      const name = tidy(c.name && c.name.en), prev = sRuns.get(name.toLowerCase());
      const r = run(name, Number(c.lv), Number(c.length) || (prev && prev.len), prev ? prev.note : (c.feature && c.feature.en) || '', RUN(Number(c.status)));
      if (prev) r.ug = prev.ug || r.ug;
      return r;
    });
    const lifts = (a.lift || []).filter(l => l.is_show !== false).map(l => {
      const name = tidy(l.name && l.name.en), t = l.biztime || {};
      return { name, type: liftType(name, l.type && l.type.en), len: Number(l.length) || null, hours: t.open && t.close ? t.open + '–' + t.close : '', status: LIFT[Number(l.status)] || null };
    });
    const el = (a.spec && a.spec.elevation) || {};
    const cond = a.condition || {}, snow = cond.snow === '' || cond.snow == null ? null : Number(cond.snow);
    return { name: s.name || AREA(a.name && a.name.en), hi: Number(el.high) || s.hi, lo: Number(el.low) || s.lo, snow: Number.isFinite(snow) ? snow : null, temp: cond.temperature === '' || cond.temperature == null ? null : Number(cond.temperature), lifts, runs };
  });
  return { at: new Date().toISOString(), live: true, areas };
}
let cache = null, cacheAt = 0, inflight = null;
async function getShiga() {
  if (cache && Date.now() - cacheAt < 10 * 60e3) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const snap = fromSnapshot();
    try {
      const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 12e3);
      const r = await fetch(FEED, { signal: ac.signal, headers: { 'user-agent': 'Mozilla/5.0 NamiPow', accept: 'application/json' } });
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const feed = await r.json();
      if (!Array.isArray(feed) || !feed.length) throw new Error('empty feed');
      cache = normalise(feed, snap);
    } catch (e) {
      console.log('[nami] shiga feed failed:', e.message);
      cache = cache && cache.live ? cache : snap;
    }
    cacheAt = Date.now(); inflight = null; return cache;
  })();
  return inflight;
}
module.exports = { getShiga, normalise, fromSnapshot, liftType };
