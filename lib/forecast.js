'use strict';
// Multi-model snow forecast from Open-Meteo (free, no key). For each mountain we ask five weather
// models for the next 10 days at the forecast height, then show the middle model ("typical") and
// the spread, in snow-forecast.com style morning / afternoon / night blocks.

const MODELS = [
  ['jma_seamless', 'JMA', 'Japan Meteorological Agency · best for Japan'],
  ['ecmwf_ifs025', 'ECMWF', 'European model · strong 3–10 days'],
  ['gfs_seamless', 'GFS', 'US model · often over-calls snow'],
  ['gem_seamless', 'GEM', 'Canadian model'],
  ['icon_seamless', 'ICON', 'German model · about 7 days']
];

const POINTS = {
  happo: { lat: 36.692, lon: 137.800, elev: 1680, sf: ['Happo-One'] },
  goryu: { lat: 36.664, lon: 137.815, elev: 1515, sf: ['HakubaGoryu', 'Hakuba47'] },
  nozawa: { lat: 36.910, lon: 138.408, elev: 1650, sf: ['Nozawa-Onsen'] },
  shiga: { lat: 36.700, lon: 138.515, elev: 1800, sf: ['ShigaKogenGiant', 'Yokoteyama'] }
};

function url(p) {
  return 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lon + '&elevation=' + p.elev +
    '&hourly=snowfall,rain,temperature_2m,freezing_level_height,wind_speed_10m&models=' + MODELS.map(m => m[0]).join(',') +
    '&forecast_days=10&timezone=Asia%2FTokyo';
}

const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const r1 = v => Math.round(v * 10) / 10;

// Turn Open-Meteo's hourly multi-model JSON into days → [AM, PM, Night] blocks.
function summarise(json, elev, today, models) {
  const H = json.hourly, T = H.time;
  const ids = models || MODELS.map(m => m[0]);
  const have = ids.filter(m => (H['snowfall_' + m] || []).some(v => v != null));
  const pick = (name, i) => { for (const m of ['ecmwf_ifs025', 'jma_seamless', 'gfs_seamless'].concat(ids)) { const v = (H[name + '_' + m] || [])[i]; if (v != null) return v; } return null; };
  const blocks = new Map(); // 'YYYY-MM-DD|0..2' -> acc
  T.forEach((t, i) => {
    const d = t.slice(0, 10), h = +t.slice(11, 13);
    let day = d, p = h < 6 ? 2 : h < 12 ? 0 : h < 18 ? 1 : 2;
    if (h < 6) { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); day = x.toISOString().slice(0, 10); }
    if (day < today) return;
    const k = day + '|' + p;
    if (!blocks.has(k)) blocks.set(k, { snow: {}, rain: {}, t: [], fl: [], w: [] });
    const b = blocks.get(k);
    have.forEach(m => {
      const s = H['snowfall_' + m][i]; if (s != null) b.snow[m] = (b.snow[m] || 0) + s;
      const r = (H['rain_' + m] || [])[i]; if (r != null) b.rain[m] = (b.rain[m] || 0) + r;
    });
    const tt = pick('temperature_2m', i); if (tt != null) b.t.push(tt);
    const f = pick('freezing_level_height', i); if (f != null) b.fl.push(f);
    const w = pick('wind_speed_10m', i); if (w != null) b.w.push(w);
  });
  const dates = [...new Set([...blocks.keys()].map(k => k.split('|')[0]))].sort().slice(0, 10);
  const days = dates.map(d => {
    const per = [0, 1, 2].map(p => {
      const b = blocks.get(d + '|' + p);
      if (!b) return null;
      const s = Object.values(b.snow);
      return {
        snow: r1(median(s)), hi: r1(s.length ? Math.max(...s) : 0), lo: r1(s.length ? Math.min(...s) : 0),
        rain: r1(median(Object.values(b.rain))),
        tmax: b.t.length ? Math.round(Math.max(...b.t)) : null, tmin: b.t.length ? Math.round(Math.min(...b.t)) : null,
        fl: b.fl.length ? Math.round(b.fl.reduce((a, c) => a + c, 0) / b.fl.length / 100) * 100 : null,
        wind: b.w.length ? Math.round(Math.max(...b.w)) : null
      };
    });
    const sum = f => Math.round(per.reduce((a, x) => a + (x ? x[f] : 0), 0));
    const dt = new Date(d + 'T12:00:00Z');
    return { date: d, dow: dt.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }), day: dt.getUTCDate(), snow: sum('snow'), lo: sum('lo'), hi: sum('hi'), per };
  });
  const totals = {};
  have.forEach(m => { totals[m] = Math.round(H['snowfall_' + m].reduce((a, v) => a + (v || 0), 0)); });
  const t = Object.values(totals);
  return { elev, days, totals, typical: Math.round(median(t)), low: t.length ? Math.min(...t) : 0, high: t.length ? Math.max(...t) : 0 };
}

module.exports = { MODELS, POINTS, url, summarise };
