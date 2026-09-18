# urbanPulse — Smart City Analytics

A self-contained, static web prototype of a smart-city analytics dashboard.
It visualizes synthetic city data — air quality, mobility, energy mix, sensor
uptime, and citizen-reported incidents — in a clean, data-viz-method-driven UI.

**No build tools. No dependencies. Open `index.html` in a browser and it runs.**

---

## What it shows

| Block | Chart form | Colors |
|---|---|---|
| **City health index** | Hero figure + breakdown | — (number) |
| **Air quality / traffic / sensors / energy** | Stat tiles with sparklines | de-emphasis + accent |
| **Air quality trend** | Multi-series line chart (PM2.5, PM10, NO₂) | categorical |
| **Traffic congestion by zone** | Grouped bar by time of day | categorical |
| **Energy mix** | Stacked bar by fuel source | categorical |
| **Sensor uptime** | Heatmap of % reporting by zone × 4-hour block | sequential (blue) |
| **Reported incidents** | Single-series bar by category | 1 hue |

### Features

- **One filter row above everything** — 7 / 30 / 90-day range re-scopes every
  chart, tile, and table so the numbers always agree.
- **Rich interactions** — hover crosshair + readout on lines, per-mark tooltips
  on bars and heat cells, keyboard navigation (arrow keys) on charts.
- **Toggleable legend** — click a swatch to hide a series; colors never re-assign
  on filter (color follows the entity).
- **Every chart has a table twin** — the "Table" button swaps in the WCAG-clean
  equivalent, so no value lives only in a tooltip.
- **Selected dark mode** — a theme toggle in the header; the OS preference only
  applies until you choose for yourself.
- **Fully responsive** — the grid collapses gracefully down to mobile.

### Data-viz method

The palette and chart anatomy follow a fixed design system:

- **Categorical hues in fixed order** (validated for color-vision safety) —
  never cycled or rank-assigned.
- **Sequential (one-hue) blue ramp** for the heatmap, with a scale legend.
- **Text never wears series color**; identity rides on the colored mark beside it.
- **Thin marks**: 2px lines, bars ≤ 24px, 4px rounded data-ends, 2px surface gaps.
- **One axis, always** — no dual-y-scale charts.
- **Direct labels are sparse** by design (endpoints and extremes only).

---

## Project structure

```
urbanPulse/
├── index.html          # Single-page dashboard shell + markup
├── css/
│   └── styles.css      # Chrome, layout, theming (roles via CSS custom props)
├── js/
│   ├── data.js         # Deterministic synthetic city data (90 days)
│   └── app.js          # Chart renderers, filters, theme, tables, tooltips
└── README.md           # This file
```

## Data

`data.js` generates **90 days** of deterministic synthetic data using a seeded
PRNG, so the demo is stable across reloads. The UI slices it by the selected
range. Replace it with a real API later — the chart layer is driven purely by
in-memory arrays, so swapping in a `fetch` is straightforward.

## Run

```bash
# Open directly:
start index.html        # Windows
open index.html         # macOS / Linux

# Or serve it (nice for localhost):
python -m http.server 8000
# then visit http://localhost:8000
```

## Roadmap (prototype → product)

- [ ] Replace synthetic data with live city APIs / WebSocket feed
- [ ] Map-based views (chloropleth of sensor uptime, incidents)
- [ ] Drill-down: zone → street-level detail
- [ ] Auth + per-role dashboards (operator vs. citizen)
- [ ] Export: PNG / CSV for reports

---

*urbanPulse · a static prototype · all data synthetic for demo purposes.*