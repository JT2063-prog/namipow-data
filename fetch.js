// NamiPow data snapshot. Runs on GitHub Actions every 3 hours (GitHub's IPs, so it doesn't share the
// app server's Open-Meteo limit) and writes public weather data the app falls back to:
//   forecast.json  five-model snow forecast per mountain (MET Norway for any that fail)
//   depth.json     model snow depth (top/base, 45 days back + 10 ahead) and official resort readings
'use strict';
const fs = require('fs');
const FC = require('./lib/forecast');
const MET = require('./lib/metno');
const RESORTS = [['happo', 'Happo-one'], ['goryu', 'Hakuba47 & Goryu'], ['nozawa', 'Nozawa'], ['shiga', 'Shiga Kogen']];
const SPOTS = {
  happo: { top: [36.698, 137.792, 1831], base: [36.697, 137.833, 760] },
  goryu: { top: [36.663, 137.800, 1676], base: [36.665, 137.833, 750] },
  nozawa: { top: [36.921, 138.428, 1650], base: [36.922, 138.444, 565] },
  shiga: { top: [36.665, 138.528, 2307], base: [36.722, 138.469, 1415] }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJson(u) { const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); const j = await r.json(); if (j.error || !r.ok) throw new Error(j.reason || 'HTTP ' + r.status); return j; }
async function main() {
  const now = new Date().toISOString();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const old = (f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } });
  const prevF = old('forecast.json'), prevD = old('depth.json');

  const resorts = []; let usedMet = false;
  for (const [key, name] of RESORTS) {
    const p = FC.POINTS[key];
    try { resorts.push(Object.assign({ key, name, sf: p.sf, source: 'open-meteo' }, FC.summarise(await getJson(FC.url(p)), p.elev, today))); }
    catch (e) {
      console.log('open-meteo', key, e.message);
      try { resorts.push(Object.assign({ key, name, sf: p.sf, source: 'met' }, FC.summarise(await MET.fetchMet(p), p.elev, today, [MET.ID]))); usedMet = true; }
      catch (e2) { console.log('met', key, e2.message); const o = prevF && prevF.resorts.find(r => r.key === key); if (o) resorts.push(Object.assign({}, o, { stale: true })); }
    }
    await sleep(1500);
  }
  const models = FC.MODELS.map(([id, name, note]) => ({ id, name, note }));
  if (usedMet) models.push({ id: MET.ID, name: 'MET Norway', note: 'Backup forecast · one model' });
  if (resorts.length && !resorts.every(r => r.stale)) fs.writeFileSync('forecast.json', JSON.stringify({ at: now, models, resorts }));

  const model = {};
  for (const [k, s] of Object.entries(SPOTS)) {
    model[k] = {};
    for (const pos of ['top', 'base']) {
      const [lat, lon, elev] = s[pos];
      try {
        const j = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&elevation=${elev}&hourly=snow_depth&past_days=45&forecast_days=10&timezone=Asia%2FTokyo`);
        const by = new Map(); j.hourly.time.forEach((t, i) => { const v = j.hourly.snow_depth[i]; if (v != null) by.set(t.slice(0, 10), Math.max(by.get(t.slice(0, 10)) ?? 0, Math.round(v * 100))); });
        model[k][pos] = { elev, days: [...by.entries()] };
      } catch (e) { console.log('depth', k, pos, e.message); model[k][pos] = (prevD && prevD.model && prevD.model[k] && prevD.model[k][pos]) || { elev, days: [] }; }
      await sleep(800);
    }
  }
  // Official readings straight from the resorts, and a running daily history of the top reading.
  const official = { happo: [], goryu: [], nozawa: [], shiga: [] };
  try { const NZ = require('./lib/nozawa'); official.nozawa = (await NZ.getNozawa()).depth || []; } catch (e) { console.log('nozawa', e.message); }
  try { const HK = require('./lib/hakuba'); const h = await HK.getHakuba(); official.happo = h.happoDepth || []; official.goryu = (h.goryuDepth || []).concat((h.h47Depth || []).map(x => Object.assign({}, x, { name: 'Hakuba47 ' + x.name }))); } catch (e) { console.log('hakuba', e.message); }
  try { const SG = require('./lib/shiga'); const s = await SG.getShiga(); if (s.live) official.shiga = s.areas.filter(a => a.snow != null).map(a => ({ name: a.name, elev: a.hi, cm: a.snow, updated: null })); } catch (e) { console.log('shiga', e.message); }
  const history = (prevD && prevD.history) || {};
  for (const [k, r] of Object.entries(official)) {
    const top = r.filter(x => x.cm != null).sort((a, b) => (b.elev || 0) - (a.elev || 0))[0];
    if (top) { history[k] = history[k] || {}; history[k][today] = top.cm; }
  }
  fs.writeFileSync('depth.json', JSON.stringify({ at: now, today, model, official, history }));
  console.log('forecast', resorts.map(r => r.key + ':' + r.source).join(' '), '| depth ok');
}
main().catch(e => { console.error(e); process.exit(1); });
