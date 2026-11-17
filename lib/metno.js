// Backup forecast from MET Norway (api.met.no Locationforecast, free, one model, ~10 days) for when
// Open-Meteo refuses (its free limit is per IP and Render's shared IP can hit it). Converted to the
// same hourly shape as Open-Meteo so lib/forecast.summarise can use it as model "met_no".
'use strict';
const ID = 'met_no';
const url = p => `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${p.lat.toFixed(3)}&lon=${p.lon.toFixed(3)}&altitude=${p.elev}`;
// Snow vs rain by temperature: all snow at or below 0.5°C, all rain from 2°C, mixed in between.
const snowShare = t => t == null ? 0 : t <= 0.5 ? 1 : t >= 2 ? 0 : (2 - t) / 1.5;
const jst = iso => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 13) + ':00';
function toHourly(json) {
  const ts = (json.properties && json.properties.timeseries) || [];
  const H = { time: [] }; ['snowfall', 'rain', 'temperature_2m', 'wind_speed_10m', 'freezing_level_height'].forEach(v => { H[v + '_' + ID] = []; });
  const push = (time, mm, t, w) => {
    const s = snowShare(t);
    H.time.push(time); H['snowfall_' + ID].push(Math.round(mm * s * 100) / 100); H['rain_' + ID].push(Math.round(mm * (1 - s) * 100) / 100);
    H['temperature_2m_' + ID].push(t); H['wind_speed_10m_' + ID].push(w == null ? null : Math.round(w * 3.6)); H['freezing_level_height_' + ID].push(null);
  };
  ts.forEach((e, i) => {
    const d = e.data || {}, inst = (d.instant && d.instant.details) || {};
    const t = inst.air_temperature ?? null, w = inst.wind_speed ?? null;
    if (d.next_1_hours) { push(jst(e.time), (d.next_1_hours.details || {}).precipitation_amount || 0, t, w); return; }
    if (d.next_6_hours) {
      // Spread a 6-hour total over the hours until the next entry (6 h in the later part of the forecast).
      const next = ts[i + 1] ? (Date.parse(ts[i + 1].time) - Date.parse(e.time)) / 3600e3 : 6, hrs = Math.max(1, Math.min(6, next));
      const mm = ((d.next_6_hours.details || {}).precipitation_amount || 0) / 6;
      for (let h = 0; h < hrs; h++) push(jst(new Date(Date.parse(e.time) + h * 3600e3).toISOString()), mm, t, w);
    }
  });
  return { hourly: H };
}
async function fetchMet(p) {
  const r = await fetch(url(p), { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'NamiPow/1.0 https://nami-ski-cams.onrender.com', accept: 'application/json' } });
  if (!r.ok) throw new Error('MET HTTP ' + r.status);
  return toHourly(await r.json());
}
module.exports = { ID, url, toHourly, fetchMet, snowShare };
