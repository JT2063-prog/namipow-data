// Nozawa Onsen live run and lift status from nozawaski.com (◯ open, △ restricted/partial, × closed).
'use strict';
const COURSES = 'https://nozawaski.com/winter/course/';
const LIFTS = 'https://nozawaski.com/winter/lift_price/lift_time/';
const SYM = { '◯': 'open', '○': 'open', '△': 'standby', '×': 'closed' };
const strip = h => h.replace(/<!--[\s\S]*?-->/g, '');
function parseCourses(html) {
  const out = {};
  for (const m of strip(html).matchAll(/<td class="font-en num">\s*(\d+)\s*<\/td>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>\s*([◯○△×])/g)) out[m[1]] = SYM[m[2]];
  return out;
}
// Snow report: five areas, each "<name>エリア 標高：1,407m … 積雪量 N cm 昨日15時～8時までの積雪量 N cm 本日8時からの積雪量 N cm".
const AREAS = [['やまびこ', 'Yamabiko', 1407], ['上ノ平', 'Uenotaira', 1230], ['日影', 'Hikage', 660], ['長坂', 'Nagasaka', 616], ['柄沢', 'Karasawa', 563]];
function parseDepth(html) {
  const text = strip(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const out = [];
  AREAS.forEach(([ja, en, elev], i) => {
    const a = text.indexOf(ja + 'エリア'); if (a < 0) return;
    const next = i + 1 < AREAS.length ? text.indexOf(AREAS[i + 1][0] + 'エリア', a + 1) : -1;
    const seg = text.slice(a, next > a ? next : a + 600);
    const nums = [...seg.matchAll(/(\d+(?:\.\d+)?)?\s*cm/g)].map(m => m[1] == null ? null : Number(m[1]));
    const upd = (seg.match(/(\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})\s*更新/) || [])[1] || null;
    out.push({ name: en, elev, cm: nums[0] ?? null, overnight: nums[1] ?? null, today: nums[2] ?? null, updated: upd });
  });
  return out;
}
function parseLifts(html) {
  const out = {};
  for (const m of strip(html).matchAll(/<td class="font-en num">\s*(\d+)\s*<\/td>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>\s*([◯○△×])/g)) out[m[1]] = { status: SYM[m[3]], hours: m[2].trim() };
  return out;
}
async function get(url) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 12e3);
  try { const r = await fetch(url, { signal: ac.signal, headers: { 'user-agent': 'Mozilla/5.0 NamiPow', 'accept-language': 'ja,en' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
  finally { clearTimeout(t); }
}
let cache = null, cacheAt = 0;
async function getNozawa() {
  if (cache && Date.now() - cacheAt < 10 * 60e3) return cache;
  try {
    const [c, l] = await Promise.all([get(COURSES), get(LIFTS)]);
    const runs = parseCourses(c), lifts = parseLifts(l), depth = parseDepth(c);
    if (!Object.keys(runs).length && !Object.keys(lifts).length) throw new Error('nothing parsed');
    cache = { at: new Date().toISOString(), runs, lifts, depth };
  } catch (e) { console.log('[nami] nozawa status failed:', e.message); cache = cache || { at: null, runs: {}, lifts: {}, depth: [] }; }
  cacheAt = Date.now(); return cache;
}
module.exports = { getNozawa, parseCourses, parseLifts, parseDepth };
