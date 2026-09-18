/* urbanPulse — synthetic city data.
   Deterministic (seeded PRNG) so the demo is stable. All data is generated
   per-day over the last 90 days; the UI picks a slice by range. */

(function () {
  'use strict';

  const DAYS = 90;
  const DAY = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // --- deterministic PRNG (mulberry32) ---
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Round a value to `p` decimal places.
  const r = (x, p = 1) => Math.round(x * Math.pow(10, p)) / Math.pow(10, p);

  function dayKey(offset) {
    const d = new Date(today.getTime() - (DAYS - 1 - offset) * DAY);
    return d.toISOString().slice(0, 10);
  }

  function dayLabel(offset) {
    const d = new Date(today.getTime() - (DAYS - 1 - offset) * DAY);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /* ---------- Pollutant series (air line chart) ---------- */
  function pollutants() {
    const rng = mulberry32(20250901);
    const sensors = [];
    for (let i = 0; i < DAYS; i++) {
      // Mild weekly seasonality + noise.
      const w = 0.7 + 0.4 * Math.sin((i / 7) * Math.PI * 2);
      sensors.push({ pm25: r(18 + w * 14 + rng() * 14 + (rng() - 0.5) * 4, 1),
                     pm10: r(24 + w * 18 + rng() * 18 + (rng() - 0.5) * 5, 1),
                     no2:  r(8  + w * 9  + rng() * 8  + (rng() - 0.5) * 3, 1) });
    }
    return sensors;
  }

  /* ---------- Air quality index (hero) ---------- */
  function aqiSeries() {
    const rng = mulberry32(20250902);
    const out = [];
    for (let i = 0; i < DAYS; i++) {
      const w = 0.7 + 0.4 * Math.sin((i / 7) * Math.PI * 2);
      out.push(Math.round(42 + w * 16 + rng() * 22 + (rng() - 0.5) * 4));
    }
    return out;
  }

  /* ---------- Active sensors ---------- */
  function sensorSeries() {
    const rng = mulberry32(20250903);
    const out = [];
    for (let i = 0; i < DAYS; i++) {
      // Slow degradation + occasional dropouts, then a recovery ramp.
      let v = 2440 - i * 0.9 + rng() * 30 - 15;
      if (i % 19 === 0) v -= 80 + rng() * 40;
      out.push(Math.round(v));
    }
    return out;
  }

  /* ---------- Traffic congestion index ---------- */
  function trafficSeries() {
    const rng = mulberry32(20250904);
    const out = [];
    for (let i = 0; i < DAYS; i++) {
      const w = 0.6 + 0.5 * Math.sin((i / 7) * Math.PI * 2);
      out.push(r(52 + w * 22 + rng() * 20, 1));
    }
    return out;
  }

  /* ---------- Energy demand (GW) ---------- */
  function energySeries() {
    const rng = mulberry32(20250905);
    const out = [];
    for (let i = 0; i < DAYS; i++) {
      const w = 0.7 + 0.4 * Math.sin((i / 7) * Math.PI * 2);
      out.push(r(34 + w * 9 + rng() * 8, 1));
    }
    return out;
  }

  /* ---------- Traffic congestion grouped by zone x time of day ---------- */
  const ZONES = ['Downtown', 'Riverside', 'Harbor', 'Old Town'];
  const DAYPARTS = ['Morning', 'Midday', 'Evening'];

  function trafficByZone() {
    const rng = mulberry32(20250906);
    const base = [[68, 44, 82],   // Downtown
                  [54, 36, 63],   // Riverside
                  [47, 30, 52],   // Harbor
                  [60, 38, 71]];  // Old Town
    return ZONES.map((z, zi) => ({
      zone: z,
      parts: DAYPARTS.map((p, pi) => r(base[zi][pi] + (rng() - 0.5) * 8, 1)),
    }));
  }

  /* ---------- Energy mix stacked bars (per period) ---------- */
  const PERIODS = ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4'];
  const FUELS = ['Solar', 'Wind', 'Gas', 'Coal', 'Imports'];

  function energyMix() {
    const rng = mulberry32(20250907);
    const shapes = { Solar: [26, 30, 27, 31],
                     Wind:  [16, 15, 19, 18],
                     Gas:   [24, 22, 21, 20],
                     Coal:  [16, 15, 14, 13],
                     Imports:[18, 18, 19, 18] };
    return PERIODS.map((p, pi) => {
      const row = { period: p, total: 0 };
      FUELS.forEach(f => { row[f] = r(shapes[f][pi] + (rng() - 0.5) * 3, 1); row.total += row[f]; });
      row.total = r(row.total, 1);
      return row;
    });
  }

  /* ---------- Sensor uptime heatmap ---------- */
  const HEAT_ZONES = ['Harbor', 'Riverside', 'Downtown', 'Old Town', 'Northgate', 'Airport'];
  const HEAT_BLOCKS = ['00–04', '04–08', '08–12', '12–16', '16–20', '20–24'];

  function sensorUptime() {
    const rng = mulberry32(20250908);
    const zones = HEAT_ZONES.map((z, zi) => {
      const base = 94 + (zi % 3) - (zi > 3 ? 2 : 0); // 94..96, Airport lower
      const row = { zone: z };
      HEAT_BLOCKS.forEach((b, bi) => {
        // Overnight slightly lower, plus noise; clamp 90–100.
        let v = base + (bi === 0 || bi === 5 ? -2 : 0) + (rng() - 0.5) * 5;
        row[b] = Math.max(90, Math.min(100, Math.round(v)));
      });
      return row;
    });
    return { zones, blocks: HEAT_BLOCKS };
  }

  /* ---------- Reported incidents (single-series bars) ---------- */
  const INCIDENTS = ['Road', 'Lighting', 'Water', 'Waste', 'Noise', 'Parking'];

  function incidents() {
    const rng = mulberry32(20250909);
    const base = [184, 132, 96, 78, 116, 204];
    return INCIDENTS.map((c, i) => ({
      category: c,
      count: Math.round(base[i] * (0.8 + rng() * 0.5)),
    }));
  }

  /* ---------- Assemble ---------- */
  const pollution = pollutants();
  const aqi = aqiSeries();

  window.UP = {
    days: DAYS,
    dayKey,
    dayLabel,
    // Daily series, one entry per day (index 0 = oldest).
    daily: {
      pollution,          // [{ pm25, pm10, no2 }]
      aqi,                // number[]
      activeSensors: sensorSeries(), // number[]
      traffic: trafficSeries(),       // number[]
      energy: energySeries(),         // number[]
    },
    // Grouped / static datasets.
    trafficByZone,        // function() -> [{ zone, parts }]
    energyMix,            // function() -> [{ period, total, ...fuels }]
    sensorUptime,         // function() -> { zones, blocks }
    incidents,            // function() -> [{ category, count }]
    // Metadata.
    zoneLabels: ZONES,
    dayparts: DAYPARTS,
    fuelLabels: FUELS,
    incidentLabels: INCIDENTS,
    pollutantLabels: [
      { key: 'pm25', label: 'PM2.5' },
      { key: 'pm10', label: 'PM10' },
      { key: 'no2',  label: 'NO₂' },
    ],
  };
})();