
# Running Dashboard

A personal running and wellness dashboard built with vanilla JS, D3.js, and Supabase. Designed for mobile-first use with swipe gestures between tabs.

## Live Demo
> Hosted via GitHub Pages — see Settings → Pages after pushing.

## Architecture

| File | Purpose |
|------|---------|
| `index.html` | Main entry point. Shared header, tab bar, swipe dots. Lazy-loads tab modules via ES modules. |
| `styles.css` | All design tokens (CSS variables), layout, card, chart, and component styles (~350 lines). |
| `shared.js` | Supabase config, global state, utility functions (`clamp`, `hmStr`, `localDate`), tab-switching logic, and swipe gesture detection. |
| `tab-wellness.js` | Wellness tab — fetches `wellness_daily` from Supabase. Renders HRV (with last-night/7D avg toggle), Resting HR, and Sleep metric cards plus a multi-series D3 chart. |
| `tab-readiness.js` | Readiness tab — computes a composite readiness score from HRV, sleep, RHR, and stress. Renders an animated SVG arc gauge, pillar breakdown cards, sleep stage segments, and a readiness history line chart. |
| `tab-volume.js` | Volume tab — fetches running activities from Supabase. Renders a calendar heatmap (Mon–Sun rows × weeks columns) with configurable date range (1/3/6 months), green/green→red colour scheme toggle, and a continuous gradient legend. |

## Data Source
[Supabase](https://supabase.com) PostgreSQL database (`myhealthdb`) fed by automated Garmin/Strava sync pipelines.

## Tech Stack
- **D3.js v7** — charts, gauge, heatmap
- **Supabase** — backend / real-time data
- **Vanilla ES Modules** — no build step required
- **Satoshi font** — via Fontshare CDN

## Setup
No build step needed. Just serve the files from any static host.

```bash
# Local development
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages
1. Go to **Settings → Pages**
2. Source: **Deploy from branch → main → / (root)**
3. Save — live in ~60 seconds at `https://foo76.github.io/running-dashboard`

## Features
- **Wellness tab** — HRV (last night / 7D avg toggle), Resting HR, Sleep duration with trend arrows
- **Readiness tab** — Composite readiness score gauge, pillar breakdown, sleep stage detail, history chart
- **Volume tab** — Running heatmap calendar, colour scheme toggle, 1/3/6 month range selector
- **Swipe gestures** — Native touch swipe between tabs
- **Tooltips** — Hover/touch tooltips on all charts
