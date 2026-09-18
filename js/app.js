/* urbanPulse — dashboard application.
   Renders synthetic city data as SVG charts following the dataviz method:
   thin marks, resident axes, 2px surface gaps, tooltips that enhance (never gate),
   a data-table twin on every chart, one filter row scoping everything,
   and selected (not auto-flipped) dark mode. */

(function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';

  /* ---------- Palette (validated categorical order; sequential = blue ramp) ---------- */
  const THEMES = {
    light: {
      surface: '#fcfcfb', page: '#f9f9f7',
      ink: '#0b0b0b', secondary: '#52514e', muted: '#898781',
      grid: '#e1e0d9', baseline: '#c3c2b7',
      series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
      deltaUp: '#006300', deltaDown: '#d03b3b',
      // Sequential blue ramp bright->dark (low -> high value).
      seq: ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#3987e5', '#2a78d6', '#184f95', '#0d366b'],
    },
    dark: {
      surface: '#1a1a19', page: '#0d0d0d',
      ink: '#ffffff', secondary: '#c3c2b7', muted: '#898781',
      grid: '#2c2c2a', baseline: '#383835',
      series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
      deltaUp: '#0ca30c', deltaDown: '#e66767',
      // Dark surface: high value = brighter, low = recede toward surface.
      seq: ['#12304e', '#17416b', '#1d5487', '#256abf', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#b7d3f6'],
    },
  };

  function theme() {
    const forced = document.documentElement.getAttribute('data-theme');
    if (forced === 'light') return 'light';
    if (forced === 'dark') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  const T = () => THEMES[theme()];

  /* ---------- State ---------- */
  const state = {
    range: 30,
    hidden: { aq: new Set(), traffic: new Set(), energy: new Set() }, // series keys per chart
    focusIdx: null,      // keyboard index for line chart
  };

  const UP = window.UP;
  const fmt = n => Number(n).toLocaleString('en-US');

  /* ---------- Small helpers ---------- */
  function el(tag, attrs, parent) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function niceMax(v) {
    const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1, v))));
    const n = v / pow;
    const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (const s of steps) if (n <= s) return s * pow;
    return 10 * pow;
  }

  /* ---------- Daisy tooltip ---------- */
  const tipEl = document.getElementById('tooltip');

  function showTip(htmlChildren, x, y) {
    tipEl.replaceChildren();
    (htmlChildren || []).forEach(c => { if (c.nodeType) tipEl.appendChild(c); });
    tipEl.hidden = false;
    const bw = tipEl.getBoundingClientRect();
    let px = x + 14, py = y - 18;
    if (px + bw.width > window.innerWidth - 8) px = x - bw.width - 14;
    if (px < 8) px = 8;
    if (py + bw.height > window.innerHeight - 8) py = y - bw.height - 14;
    if (py < 8) py = 8;
    tipEl.style.left = px + 'px';
    tipEl.style.top = py + 'px';
  }
  function hideTip() { tipEl.hidden = true; }

  function titleRow(text) {
    const d = document.createElement('div');
    d.className = 'tip-title';
    d.textContent = text;
    return d;
  }
  function tipRow(key, color, label, value) {
    const d = document.createElement('div');
    d.className = 'tip-row';
    const k = document.createElement('span');
    k.className = 'tip-key';
    k.style.background = color;
    const l = document.createElement('span');
    l.textContent = label;
    const b = document.createElement('b');
    b.textContent = value;
    d.appendChild(k); d.appendChild(l); d.appendChild(b);
    return d;
  }

  /* ---------- Chart frame: axes + gridlines ---------- */
  // Returns { W, H, plot(top/left/right/bottom), x, y } drawing plan + drawn axes.
  function svgSpace(container, opts) {
    const cw = Math.max(container.clientWidth, 260);
    const H = opts.height;
    const padL = opts.padL != null ? opts.padL : 44;
    const padR = opts.padR != null ? opts.padR : 14;
    const padT = 6, padB = opts.padB != null ? opts.padB : 26;
    const W = cw;
    return {
      W, H,
      plot: { top: padT, bottom: H - padB, left: padL, right: W - padR },
      width: W, height: H,
    };
  }

  function drawGrid(svg, plot, yTicks, fmtTick) {
    for (const t of yTicks) {
      svgEl('line', { x1: plot.left, y1: t.y, x2: plot.right, y2: t.y, stroke: T().grid, 'stroke-width': 1 }, svg);
      svgEl('text', { x: plot.left - 8, y: t.y + 4, 'text-anchor': 'end', 'font-size': 11, fill: T().muted }, svg)
        .textContent = fmtTick(t.v);
    }
  }

  /* ===================================================================
     LINE CHART — air quality (multi-series)
     =================================================================== */
  function renderLine(sel, seriesMeta, opts) {
    const cont = document.getElementById(sel);
    cont.innerHTML = '';
    const sf = svgSpace(cont, { height: opts.height, padR: 74, padB: 30 });
    const plot = sf.plot;
    const svg = svgEl('svg', { width: sf.W, height: sf.H, role: 'img', 'aria-label': opts.aria }, cont);

    const visible = seriesMeta.filter(s => !state.hidden[opts.hiddenKey].has(s.key));
    const all = seriesMeta.length > 0 ? seriesMeta[0].data.length : 0; // days per series
    const n = visible.length;
    if (n === 0) {
      const t = svgEl('text', { x: plot.left + (plot.right - plot.left) / 2, y: plot.top + 80, 'text-anchor': 'middle', fill: T().muted, 'font-size': 13 }, svg);
      t.textContent = 'All series hidden';
      return;
    }

    // Y scale
    let max = 0;
    for (const s of visible) for (const v of s.data) max = Math.max(max, v);
    const yMax = niceMax(max * 1.08);
    const xAt = i => plot.left + (i / (all - 1)) * (plot.right - plot.left);
    const yAt = v => plot.bottom - (v / yMax) * (plot.bottom - plot.top);

    // gridline ticks
    const tickCount = 4;
    const ticks = [];
    for (let k = 0; k <= tickCount; k++) {
      const v = (yMax / tickCount) * k;
      ticks.push({ v: Math.round(v * 100) / 100, y: yAt(v) });
    }
    drawGrid(svg, plot, ticks, v => fmt(v));

    // baseline
    svgEl('line', { x1: plot.left, y1: plot.bottom, x2: plot.right, y2: plot.bottom, stroke: T().baseline, 'stroke-width': 1 }, svg);

    // X ticks (sparse) — i indexes into the sliced range, map back to a real date.
    const labelEvery = Math.ceil(all / 6);
    const dayOffset = UP.days - all;
    for (let i = 0; i < all; i += labelEvery) {
      svgEl('text', { x: xAt(i), y: plot.bottom + 18, 'text-anchor': 'middle', 'font-size': 11, fill: T().muted }, svg)
        .textContent = UP.dayLabel(dayOffset + i);
    }

    // paths
    visible.forEach((s) => {
      const pts = s.data.map((v, i) => [xAt(i), yAt(v)]);
      const color = s.color;
      if (opts.area !== 'none') {
        const d = 'M' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') +
                  'L' + pts[pts.length - 1][0].toFixed(1) + ',' + plot.bottom +
                  'L' + pts[0][0].toFixed(1) + ',' + plot.bottom + 'Z';
        svgEl('path', { d, fill: color, opacity: 0.09 }, svg);
      }
      const path = svgEl('path', { d: 'M' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L'), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      void path;
      // end dot
      svgEl('circle', { cx: pts[pts.length - 1][0], cy: pts[pts.length - 1][1], r: 4, fill: color, stroke: T().surface, 'stroke-width': 2 }, svg);
      // direct end label (values lead — sparse, one per line)
      if (all >= 12) {
        const lx = plot.right + 8;
        const ly = pts[pts.length - 1][1] + 4;
        const txt = svgEl('text', { x: lx, y: ly, 'font-size': 11, fill: T().secondary }, svg);
        txt.textContent = s.short + ' ' + fmt(s.data[s.data.length - 1]);
      }
    });
    // Crosshair + readout
    const cx = svgEl('line', { x1: 0, y1: plot.top, x2: 0, y2: plot.bottom, stroke: T().baseline, 'stroke-width': 1, opacity: 0.6, visibility: 'hidden' }, svg);
    let focusRing = null;

    function pick(i) {
      hideTip();
      cx.setAttribute('visibility', 'visible');
      cx.setAttribute('x1', xAt(i)); cx.setAttribute('x2', xAt(i));
      // focus marker
      if (focusRing) focusRing.remove();
      const group = svgEl('g', {}, svg);
      focusRing = group;
      const rows = [];
      rows.push(titleRow(UP.dayLabel(dayOffset + i)));
      visible.forEach(s => {
        const pts = pointsOf(s);
        const p = pts[clamp(i, 0, pts.length - 1)];
        svgEl('circle', { cx: p[0], cy: p[1], r: 5, fill: T().surface, stroke: s.color, 'stroke-width': 2 }, group);
        rows.push(tipRow('', s.color, s.short, fmt(s.data[i])));
      });
      // tooltip near the point
      const rect = cont.getBoundingClientRect();
      showTip(rows, rect.left + xAt(i), rect.top + yAt(visible[0].data[i]));
      return i;
    }
    function hidePick() {
      cx.setAttribute('visibility', 'hidden');
      if (focusRing) { focusRing.remove(); focusRing = null; }
    }

    // point hit layer (one tooltip, all series)
    function pointsOf(s) { return s.data.map((v, ii) => [xAt(ii), yAt(v)]); }

    let cursorX = -1;
    cont.addEventListener('pointermove', ev => {
      const r = svg.getBoundingClientRect();
      const mx = ev.clientX - r.left;
      const raw = ((mx - plot.left) / (plot.right - plot.left)) * (all - 1);
      const i = clamp(Math.round(raw), 0, all - 1);
      if (i !== cursorX) { cursorX = i; pick(i); }
    });
    cont.addEventListener('pointerleave', () => { cursorX = -1; hidePick(); hideTip(); });

    // Keyboard
    state.focusIdx = null;
    cont.role = 'application';
    cont.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft' || ev.key === 'Home' || ev.key === 'End') {
        ev.preventDefault();
        const cur = state.focusIdx != null ? state.focusIdx : Math.floor(all / 2);
        let i = cur;
        if (ev.key === 'ArrowRight') i = Math.min(all - 1, cur + 1);
        else if (ev.key === 'ArrowLeft') i = Math.max(0, cur - 1);
        else if (ev.key === 'Home') i = 0;
        else if (ev.key === 'End') i = all - 1;
        state.focusIdx = i;
        pick(i);
      }
    });
  }

  /* ===================================================================
     STAT TILES + HERO
     =================================================================== */
  function sparkline(elId, values, accent) {
    const host = document.getElementById(elId);
    host.innerHTML = '';
    const W = host.clientWidth || 120, H = 26;
    const svg = svgEl('svg', { width: W, height: H, 'aria-hidden': 'true' }, host);
    const min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    const span = (max - min) || 1;
    const pts = values.map((v, i) => [i / (values.length - 1) * (W - 4) + 2, H - 3 - (v - min) / span * (H - 6)]);
    // recent points in accent, rest muted
    const cut = Math.max(0, pts.length - Math.min(4, pts.length));
    const muted = 'M' + pts.slice(0, cut).map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L');
    const accentSeg = 'M' + pts.slice(cut).map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L');
    if (cut > 1) svgEl('path', { d: muted, class: 'spark-line' }, svg);
    if (pts.length - cut >= 1) svgEl('path', { d: accentSeg, fill: 'none', stroke: accent, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, svg);
    const last = pts[pts.length - 1];
    svgEl('circle', { cx: last[0], cy: last[1], r: 2.5, fill: accent }, svg);
  }

  function slice(arr, range) { return arr.slice(-range); }

  function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

  // signed % change, current vs preceding equal-length window
  function pctChange(arr, range) {
    if (arr.length < range * 2) return null;
    const cur = slice(arr, range);
    const prev = arr.slice(-range * 2, -range);
    const ac = avg(cur), ap = avg(prev);
    return ap === 0 ? null : ((ac - ap) / ap) * 100;
  }

  function deltaEl(containerId, pct, upIsGood) {
    const host = document.getElementById(containerId);
    host.textContent = '';
    if (pct == null) { host.textContent = 'vs prior window'; return; }
    const cls = pct === 0 ? 'delta-neutral' : ((pct > 0) === upIsGood ? 'delta-up' : 'delta-down');
    const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '■';
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = arrow + ' ' + Math.abs(pct).toFixed(1) + '% vs prior ' + state.range + 'd';
    host.appendChild(span);
  }

  // Composite health score over a window [end - len, end): higher = healthier.
  function healthScore(end, len) {
    const aqi = UP.daily.aqi.slice(end - len, end);
    const tr = UP.daily.traffic.slice(end - len, end);
    const en = UP.daily.energy.slice(end - len, end);
    const se = UP.daily.activeSensors.slice(end - len, end);
    const h = [
      clamp((100 - avg(aqi)) / 1.4, 0, 100),
      clamp((100 - avg(tr)) * 1.3, 0, 100),
      clamp((100 - avg(en)) * 1.1, 0, 100),
      clamp((avg(se) - 2200) / 6, 0, 100),
    ];
    return h.reduce((a, b) => a + b, 0) / h.length;
  }

  // Percent change of a metric over the selected range vs the equal-length
  // window immediately before it (null when no full prior window exists).
  function heroDelta(range) {
    if (UP.days < range * 2) return null;
    const cur = healthScore(UP.days, range);
    const prev = healthScore(UP.days - range, range);
    return prev === 0 ? 0 : ((cur - prev) / prev) * 100;
  }

  function renderTiles() {
    const rng = state.range;
    const aqi = slice(UP.daily.aqi, rng);
    const sensors = slice(UP.daily.activeSensors, rng);
    const traffic = slice(UP.daily.traffic, rng);
    const energy = slice(UP.daily.energy, rng);

    const hero = Math.round(healthScore(UP.days, rng));
    const heroPct = heroDelta(rng);
    document.getElementById('hero-value').textContent = hero;
    deltaEl('hero-delta', heroPct, true);
    document.getElementById('hero-breakdown').innerHTML = '';
    const bd = document.getElementById('hero-breakdown');
    const air = document.createElement('span'); air.innerHTML = 'Air <b>' + UP.daily.aqi[UP.days - 1] + '</b>';
    const mob = document.createElement('span'); mob.innerHTML = 'Mobility <b>' + UP.daily.traffic[UP.days - 1].toFixed(0) + '</b>';
    const enr = document.createElement('span'); enr.innerHTML = 'Energy <b>' + UP.daily.energy[UP.days - 1].toFixed(0) + '</b>';
    bd.appendChild(air); bd.appendChild(mob); bd.appendChild(enr);

    // AQI (up is bad)
    document.getElementById('aqi-value').textContent = Math.round(avg(aqi));
    deltaEl('aqi-delta', pctChange(UP.daily.aqi, rng), false);
    sparkline('aqi-spark', aqi, T().series[2]);

    // Sensors (up is good)
    document.getElementById('sensor-value').textContent = fmt(Math.round(avg(sensors)));
    deltaEl('sensor-delta', pctChange(UP.daily.activeSensors, rng), true);
    sparkline('sensor-spark', sensors, T().series[1]);

    // Traffic (up is bad)
    document.getElementById('traffic-value').textContent = avg(traffic).toFixed(0);
    deltaEl('traffic-delta', pctChange(UP.daily.traffic, rng), false);
    sparkline('traffic-spark', traffic, T().series[3]);

    // Energy (up is bad — demand)
    document.getElementById('energy-value').textContent = avg(energy).toFixed(1);
    deltaEl('energy-delta', pctChange(UP.daily.energy, rng), false);
    sparkline('energy-spark', energy, T().series[4]);

    // role announcements
    document.getElementById('updated').textContent =
      new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /* ===================================================================
     GROUPED BAR — traffic by zone x time of day (identity from dayparts)
     =================================================================== */
  function buildLegend(containerId, items, chartId, onToggle) {
    const host = document.getElementById(containerId);
    host.innerHTML = '';
    items.forEach(it => {
      const item = document.createElement('div');
      item.className = 'legend-item' + (state.hidden[chartId].has(it.key) ? ' off' : '');
      const sw = document.createElement('span');
      sw.className = 'legend-swatch';
      sw.style.background = it.color;
      const lab = document.createElement('span');
      lab.textContent = it.label;
      item.appendChild(sw); item.appendChild(lab);
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-pressed', String(!state.hidden[chartId].has(it.key)));
      item.addEventListener('click', () => {
        if (state.hidden[chartId].has(it.key)) state.hidden[chartId].delete(it.key);
        else state.hidden[chartId].add(it.key);
        buildLegend(containerId, items, chartId, onToggle);
        onToggle();
      });
      host.appendChild(item);
    });
  }

  function renderGrouped(sel, data, items, opts) {
    const cont = document.getElementById(sel);
    cont.innerHTML = '';
    const sf = svgSpace(cont, { height: opts.height });
    const plot = sf.plot;
    const svg = svgEl('svg', { width: sf.W, height: sf.H, role: 'img', 'aria-label': opts.aria }, cont);
    const visible = items.filter(it => !state.hidden[opts.hiddenKey].has(it.key));
    if (visible.length === 0) { svgEl('text', { x: plot.left + (plot.right - plot.left) / 2, y: plot.top + 60, 'text-anchor': 'middle', fill: T().muted, 'font-size': 13 }, svg).textContent = 'All series hidden'; return; }
    const groups = data.length;
    const seriesCount = visible.length;

    let max = 0;
    data.forEach(row => visible.forEach(it => max = Math.max(max, row[it.key])));
    const yMax = niceMax(max * 1.1);
    const yAt = v => plot.bottom - (v / yMax) * (plot.bottom - plot.top);
    const slot = (plot.right - plot.left) / groups;
    const rawBand = slot * 0.62 - 2 * (seriesCount - 1) * 2;
    const barW = Math.max(4, Math.min(24, rawBand / seriesCount));

    const tickCount = 4;
    for (let k = 0; k <= tickCount; k++) {
      const v = (yMax / tickCount) * k;
      svgEl('line', { x1: plot.left, y1: yAt(v), x2: plot.right, y2: yAt(v), stroke: T().grid, 'stroke-width': 1 }, svg);
      svgEl('text', { x: plot.left - 8, y: yAt(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: T().muted }, svg).textContent = fmt(Math.round(v));
    }
    svgEl('line', { x1: plot.left, y1: plot.bottom, x2: plot.right, y2: plot.bottom, stroke: T().baseline, 'stroke-width': 1 }, svg);

    const bandStart = (slot - (seriesCount * barW + (seriesCount - 1) * 2)) / 2;

    data.forEach((row, gi) => {
      const gx = plot.left + gi * slot;
      // zone label
      svgEl('text', { x: gx + slot / 2, y: plot.bottom + 18, 'text-anchor': 'middle', 'font-size': 11, fill: T().muted }, svg).textContent = row.label;
      svgEl('text', { x: gx + slot / 2, y: plot.bottom + 31, 'text-anchor': 'middle', 'font-size': 10, fill: T().muted, opacity: 0.8 }, svg).textContent = opts.groupSub(row);

      visible.forEach((it, si) => {
        const x = gx + bandStart + si * (barW + 2);
        const v = row[it.key];
        const y = yAt(v);
        const h = plot.bottom - y;
        const bar = svgEl('rect', { x, y, width: barW, height: Math.max(h, 0.8), rx: v > 0 ? 4 : 0, fill: it.color }, svg);
        bar.addEventListener('pointerenter', () => {
          showTip([titleRow(row.label + ' · ' + it.label), tipRow('', it.color, it.label, fmt(v))], bar.getBoundingClientRect().left + barW / 2, bar.getBoundingClientRect().top);
          bar.setAttribute('opacity', 0.9);
        });
        bar.addEventListener('pointerleave', () => { hideTip(); bar.setAttribute('opacity', 1); });
        bar.addEventListener('focus', () => showTip([titleRow(row.label + ' · ' + it.label), tipRow('', it.color, it.label, fmt(v))], bar.getBoundingClientRect().left + barW / 2, bar.getBoundingClientRect().top));
        bar.tabIndex = 0;
      });
      // direct label on the largest visible bar of the group
      const best = visible.reduce((a, b) => row[a.key] >= row[b.key] ? a : b);
      svgEl('text', { x: gx + slot / 2, y: yAt(row[best.key]) - 6, 'text-anchor': 'middle', 'font-size': 11, fill: T().secondary }, svg).textContent = fmt(row[best.key]);
    });
  }

  /* ===================================================================
     STACKED BAR — energy mix (part-to-whole)
     =================================================================== */
  function renderStacked(sel, data, items, opts) {
    const cont = document.getElementById(sel);
    cont.innerHTML = '';
    const sf = svgSpace(cont, { height: opts.height });
    const plot = sf.plot;
    const svg = svgEl('svg', { width: sf.W, height: sf.H, role: 'img', 'aria-label': opts.aria }, cont);
    const visible = items.filter(it => !state.hidden[opts.hiddenKey].has(it.key));
    if (visible.length === 0) { svgEl('text', { x: plot.left + (plot.right - plot.left) / 2, y: plot.top + 60, 'text-anchor': 'middle', fill: T().muted, 'font-size': 13 }, svg).textContent = 'All series hidden'; return; }

    // Base the scale on the sum of *visible* series, so hiding a series
    // re-bases the remaining share rather than leaving empty headroom.
    const visibleTotalFor = row => visible.reduce((s, it) => s + (row[it.key] || 0), 0);
    const maxTotal = Math.max.apply(null, data.map(visibleTotalFor));
    const yMax = niceMax(Math.max(maxTotal, 1) * 1.06 + 6);
    const yAt = v => plot.bottom - (v / yMax) * (plot.bottom - plot.top);
    const groups = data.length;
    const slot = (plot.right - plot.left) / groups;
    const barW = Math.min(46, slot * 0.5);

    const tickCount = 4;
    for (let k = 0; k <= tickCount; k++) {
      const v = (yMax / tickCount) * k;
      svgEl('line', { x1: plot.left, y1: yAt(v), x2: plot.right, y2: yAt(v), stroke: T().grid, 'stroke-width': 1 }, svg);
      svgEl('text', { x: plot.left - 8, y: yAt(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: T().muted }, svg).textContent = Math.round(v) + '%';
    }
    svgEl('line', { x1: plot.left, y1: plot.bottom, x2: plot.right, y2: plot.bottom, stroke: T().baseline, 'stroke-width': 1 }, svg);

    data.forEach((row, gi) => {
      const gx = plot.left + gi * slot + (slot - barW) / 2;
      let acc = 0;
      let top = plot.bottom;
      visible.forEach((it) => {
        const v = row[it.key];
        const segTop = yAt(acc + v);
        const h = yAt(acc) - yAt(acc + v);
        const fill = it.areaColor || it.color;
        const seg = svgEl('rect', { x: gx, y: segTop, width: barW, height: Math.max(h, 0.8), rx: v > 0 && acc + v >= row.total ? 4 : 0, fill }, svg);
        seg.addEventListener('pointerenter', () => {
          showTip([titleRow(row.period + ' · ' + it.label), tipRow('', it.color, 'Share of load', v + ' %')],
            seg.getBoundingClientRect().left + barW, seg.getBoundingClientRect().top);
        });
        seg.addEventListener('pointerleave', hideTip);
        seg.tabIndex = 0;
        seg.addEventListener('focus', () => showTip([titleRow(row.period + ' · ' + it.label), tipRow('', it.color, 'Share of load', v + ' %')],
          seg.getBoundingClientRect().left + barW, seg.getBoundingClientRect().top));
        acc += v;
        top = segTop;
      });
      // total label above stack (visible total, so it tracks hidden series)
      const visTotal = Math.round(visibleTotalFor(row));
      svgEl('text', { x: gx + barW / 2, y: top - 6, 'text-anchor': 'middle', 'font-size': 11, fill: T().secondary }, svg)
        .textContent = (visible.length === items.length ? Math.round(row.total) : visTotal) + '%';
      svgEl('text', { x: gx + barW / 2, y: plot.bottom + 18, 'text-anchor': 'middle', 'font-size': 11, fill: T().muted }, svg)
        .textContent = row.period;
    });
  }

  /* ===================================================================
     HEATMAP — sensor uptime (sequential)
     =================================================================== */
  function heatColor(v, min, max) {
    const ramp = T().seq;
    const t = clamp((v - min) / (max - min), 0, 1);
    return ramp[Math.round(t * (ramp.length - 1))];
  }

  function renderHeat(sel, data, opts) {
    const cont = document.getElementById(sel);
    cont.innerHTML = '';
    const rows = data.zones.length, cols = data.blocks.length;
    const cw = Math.max(cont.clientWidth, 260);
    const cellH = Math.max(28, Math.min(34, (280) / rows));
    const H = 6 + rows * cellH + 30;
    const padL = 86;
    const padR = 12;
    const W = cw;
    const cellW = (W - padL - padR) / cols;
    const svg = svgEl('svg', { width: W, height: H, role: 'img', 'aria-label': opts.aria }, cont);

    const min = 90, max = 100;
    // column headers
    data.blocks.forEach((b, bi) => {
      svgEl('text', { x: padL + bi * cellW + cellW / 2, y: 16, 'text-anchor': 'middle', 'font-size': 11, fill: T().muted }, svg).textContent = b;
    });
    // rows
    data.zones.forEach((z, zi) => {
      const y = 22 + zi * cellH;
      svgEl('text', { x: padL - 8, y: y + cellH * 0.65, 'text-anchor': 'end', 'font-size': 11, fill: T().secondary }, svg).textContent = z.zone;
      data.blocks.forEach((b, bi) => {
        const v = z[b];
        const fill = heatColor(v, min, max);
        // 1px inset on each side = 2px surface gap between cells.
        const cell = svgEl('rect', { x: padL + bi * cellW + 1, y: y + 1, width: cellW - 2, height: cellH - 2, fill, rx: 3 }, svg);
        cell.addEventListener('pointerenter', () => {
          showTip([titleRow(z.zone + ' · ' + b + ' block'), tipRow('', fill, 'Reporting', v + '%')], cell.getBoundingClientRect().left + cellW / 2, cell.getBoundingClientRect().top);
        });
        cell.addEventListener('pointerleave', hideTip);
        cell.tabIndex = 0;
        cell.addEventListener('focus', () => showTip([titleRow(z.zone + ' · ' + b + ' block'), tipRow('', fill, 'Reporting', v + '%')], cell.getBoundingClientRect().left + cellW / 2, cell.getBoundingClientRect().top));
      });
    });

    // scale legend baked into html handled by css; update endpoints
    document.getElementById('sensor-scale-min').textContent = min + '%';
    document.getElementById('sensor-scale-max').textContent = max + '%';
    document.getElementById('sensor-scale-bar').style.setProperty('--seq-100', T().seq[0]);
    document.getElementById('sensor-scale-bar').style.setProperty('--seq-650', T().seq[T().seq.length - 1]);
  }

  /* ===================================================================
     SINGLE-SERIES BAR — incidents
     =================================================================== */
  function renderIncidents(sel, data, opts) {
    const cont = document.getElementById(sel);
    cont.innerHTML = '';
    const sf = svgSpace(cont, { height: opts.height });
    const plot = sf.plot;
    const svg = svgEl('svg', { width: sf.W, height: sf.H, role: 'img', 'aria-label': opts.aria }, cont);
    const n = data.length;
    const yMax = niceMax(Math.max.apply(null, data.map(d => d.count)) * 1.08);
    const yAt = v => plot.bottom - (v / yMax) * (plot.bottom - plot.top);
    const slot = (plot.right - plot.left) / n;
    const barW = Math.min(34, slot * 0.56);
    const color = T().series[0];

    const tickCount = 4;
    for (let k = 0; k <= tickCount; k++) {
      const v = (yMax / tickCount) * k;
      svgEl('line', { x1: plot.left, y1: yAt(v), x2: plot.right, y2: yAt(v), stroke: T().grid, 'stroke-width': 1 }, svg);
      svgEl('text', { x: plot.left - 8, y: yAt(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: T().muted }, svg).textContent = fmt(Math.round(v));
    }
    svgEl('line', { x1: plot.left, y1: plot.bottom, x2: plot.right, y2: plot.bottom, stroke: T().baseline, 'stroke-width': 1 }, svg);

    data.forEach((d, i) => {
      const gx = plot.left + i * slot + (slot - barW) / 2;
      const y = yAt(d.count);
      const h = plot.bottom - y;
      const bar = svgEl('rect', { x: gx, y, width: barW, height: Math.max(h, 0.8), rx: d.count > 0 ? 4 : 0, fill: color }, svg);
      bar.addEventListener('pointerenter', () => {
        showTip([titleRow(d.category), tipRow('', color, 'Reports', fmt(d.count))], bar.getBoundingClientRect().left + barW / 2, bar.getBoundingClientRect().top);
      });
      bar.addEventListener('pointerleave', hideTip);
      bar.tabIndex = 0;
      bar.addEventListener('focus', () => showTip([titleRow(d.category), tipRow('', color, 'Reports', fmt(d.count))], bar.getBoundingClientRect().left + barW / 2, bar.getBoundingClientRect().top));
      // label at the tip
      svgEl('text', { x: gx + barW / 2, y: y - 6, 'text-anchor': 'middle', 'font-size': 11, fill: T().secondary }, svg).textContent = fmt(d.count);
      svgEl('text', { x: gx + barW / 2, y: plot.bottom + 18, 'text-anchor': 'middle', 'font-size': 11, fill: T().muted }, svg).textContent = d.category;
    });
  }

  /* ===================================================================
     DATA TABLES (accessibility twins) — built with textContent everywhere
     =================================================================== */
  function buildTable(tableId, caption, headers, rows) {
    const table = document.getElementById(tableId);
    table.innerHTML = '';
    const c = document.createElement('caption');
    c.textContent = caption;
    table.appendChild(c);
    const thead = el('thead');
    const tr = el('tr');
    headers.forEach(h => { const th = el('th'); th.textContent = h; tr.appendChild(th); });
    thead.appendChild(tr); table.appendChild(thead);
    const tbody = el('tbody');
    rows.forEach(r => {
      const tr2 = el('tr');
      r.forEach(cell => { const td = el('td'); td.textContent = cell; tr2.appendChild(td); });
      tbody.appendChild(tr2);
    });
    table.appendChild(tbody);
  }

  /* ===================================================================
     RENDER ALL with current range
     =================================================================== */
  // Build daily series arrays for the current range.
  // sourceData: array of objects (e.g. UP.daily.pollution)
  // meta: [{ key, short, full, slot }]
  function makeDaily(sourceData, meta, range) {
    return meta.map(m => {
      const data = sourceData.map(o => o[m.key]).slice(-range);
      return { key: m.key, short: m.short, full: m.full, color: T().series[m.slot - 1], data };
    });
  }

  function render() {
    const range = state.range;

    // ---- Air quality line ----
    const aqItems = [{ key: 'pm25', short: 'PM2.5', full: 'PM2.5 (µg/m³)', slot: 1 },
                     { key: 'pm10', short: 'PM10', full: 'PM10 (µg/m³)', slot: 2 },
                     { key: 'no2',  short: 'NO₂', full: 'NO₂ (µg/m³)', slot: 3 }];
    const aqSeries = makeDaily(UP.daily.pollution, aqItems, range);
    buildLegend('aq-legend', aqItems.map((it, i) => ({ key: it.key, label: it.full, color: T().series[it.slot - 1] })), 'aq', () => render());
    renderLine('aq-chart', aqSeries, { height: 270, hiddenKey: 'aq', aria: 'Air quality line chart' });

    // ---- Traffic grouped ----
    const tz = UP.trafficByZone();
    const tItems = UP.dayparts.map((p, i) => ({ key: p.toLowerCase(), label: p, slot: i + 1, color: T().series[i] }));
    const tData = tz.map(z => {
      const row = { label: z.zone };
      z.parts.forEach((v, i) => { row[UP.dayparts[i].toLowerCase()] = v; });
      return row;
    });
    buildLegend('traffic-legend', tItems.map(it => ({ key: it.key, label: it.label, color: it.color })), 'traffic', () => render());
    renderGrouped('traffic-chart', tData, tItems, { height: 250, hiddenKey: 'traffic', aria: 'Traffic congestion grouped bar chart', groupSub: () => 'index' });

    // ---- Energy stacked ----
    const em = UP.energyMix();
    const eItems = UP.fuelLabels.map((f, i) => ({ key: f.toLowerCase(), label: f, slot: i + 1, color: T().series[i] }));
    const eData = em.map(row => {
      const out = { label: row.period, period: row.period, total: Math.round(row.total) };
      UP.fuelLabels.forEach(f => { out[f.toLowerCase()] = row[f]; });
      return out;
    });
    buildLegend('energy-legend', eItems.map(it => ({ key: it.key, label: it.label, color: it.color })), 'energy', () => render());
    renderStacked('energy-chart', eData, eItems, { height: 250, hiddenKey: 'energy', aria: 'Energy mix stacked bar chart' });

    // ---- Sensor uptime heat ----
    renderHeat('sensor-chart', UP.sensorUptime(), { aria: 'Sensor uptime heatmap' });

    // ---- Incidents ----
    const inc = UP.incidents().slice().sort((a, b) => b.count - a.count);
    renderIncidents('incident-chart', inc, { height: 250, aria: 'Reported incidents bar chart' });

    // ---- Tiles + hero ----
    renderTiles();

    // ---- Tables ----
    buildTable('aq-table', 'Air quality — daily pollutants, ' + range + '-day slice',
      ['Day', 'PM2.5', 'PM10', 'NO₂'],
      rangeArr().map((d, i) => [UP.dayLabel(i + (UP.days - range)), d.pm25, d.pm10, d.no2]));
    buildTable('traffic-table', 'Traffic congestion by zone — average index',
      ['Zone'].concat(UP.dayparts),
      tData.map(rw => [rw.label].concat(UP.dayparts.map(p => rw[p.toLowerCase()]))));
    buildTable('energy-table', 'Energy mix — share of load by period (%)',
      ['Period'].concat(UP.fuelLabels).concat(['Total']),
      eData.map(rw => [rw.period].concat(UP.fuelLabels.map(f => rw[f.toLowerCase()])).concat([rw.total])));
    buildTable('sensor-table', 'Sensor uptime — % reporting by zone and block',
      ['Zone'].concat(UP.sensorUptime().blocks),
      UP.sensorUptime().zones.map(z => [z.zone].concat(UP.sensorUptime().blocks.map(b => z[b] + '%'))));
    buildTable('incident-table', 'Reported incidents by category',
      ['Category', 'Reports'],
      inc.map(d => [d.category, fmt(d.count)]));

    // ---- Range hint ----
    const first = UP.dayLabel(UP.days - range), last = UP.dayLabel(UP.days - 1);
    document.getElementById('range-hint').textContent = 'Last ' + range + ' days · ' + first + ' – ' + last;
  }

  function rangeArr() { return UP.daily.pollution.slice(-state.range); }

  /* ---------- Table toggles ---------- */
  function bindTableToggle(chartId, tableId) {
    const btn = document.querySelector('[data-chart="' + chartId + '"] .table-toggle');
    const table = document.getElementById(tableId);
    btn.addEventListener('click', () => {
      const open = table.hidden;
      table.hidden = !open;
      btn.textContent = open ? 'Hide table' : 'Table';
    });
  }

  /* ---------- Theme toggle ---------- */
  const toggle = document.getElementById('theme-toggle');
  function applyTheme(force) {
    const cur = force || theme();
    document.documentElement.setAttribute('data-theme', cur);
    toggle.setAttribute('aria-pressed', String(cur === 'dark'));
  }
  toggle.addEventListener('click', () => {
    const next = theme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    render();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!document.documentElement.getAttribute('data-theme')) { applyTheme(); render(); } });

  /* ---------- Range filters ---------- */
  document.getElementById('range-group').addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-range]');
    if (!btn) return;
    document.querySelectorAll('#range-group button').forEach(b => b.setAttribute('aria-checked', String(b === btn)));
    state.range = Number(btn.dataset.range);
    render();
  });

  /* ---------- Resize ---------- */
  let rto;
  window.addEventListener('resize', () => { clearTimeout(rto); rto = setTimeout(render, 150); });

  /* ---------- Ready ---------- */
  applyTheme();
  bindTableToggle('air', 'aq-table');
  bindTableToggle('traffic', 'traffic-table');
  bindTableToggle('energy', 'energy-table');
  bindTableToggle('sensors', 'sensor-table');
  bindTableToggle('incidents', 'incident-table');
  render();
})();