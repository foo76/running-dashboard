import { state, SB_URL, SB_KEY } from './shared.js';

const CTL_DAYS = 42;
const ATL_DAYS = 7;
const CTL_K = 1 - Math.exp(-1 / CTL_DAYS);
const ATL_K = 1 - Math.exp(-1 / ATL_DAYS);

const PERIODS = [
  { label: '1M',  months: 1  },
  { label: '3M',  months: 3  },
  { label: '6M',  months: 6  },
  { label: '12M', months: 12 },
  { label: '24M', months: 24 }
];
const DEFAULT_PERIOD = 6;

const C_CTL  = '#A070D0';
const C_ATL  = '#E08030';
const C_TSB  = '#E0D060';
const C_LOAD = '#C8A0E8';

const sportLabel = t => {
  if (!t) return 'Activity';
  const s = t.toLowerCase();
  if (s.includes('run'))  return '🏃 Run';
  if (s.includes('ride') || s.includes('cycl')) return '🚴 Ride';
  if (s.includes('swim')) return '🏊 Swim';
  if (s.includes('walk')) return '🚶 Walk';
  if (s.includes('hike')) return '🥾 Hike';
  return '⚡ ' + t;
};

let ls = {
  activePeriod: DEFAULT_PERIOD,
  allActivities: [],
  pmcSeries: null,
  fetched: false
};

// ── Inject CSS once ────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('load-tab-styles')) return;
  const style = document.createElement('style');
  style.id = 'load-tab-styles';
  style.textContent = `
    #panel-load { padding:10px 16px 24px; display:flex; flex-direction:column; gap:10px; }

    .load-header { display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:8px; }
    .load-eyebrow { font-size:.56rem; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color:#5A6A88; }
    .load-pmc-vals { display:flex; gap:14px; flex-wrap:wrap; margin-top:4px; }
    .load-val-item { font-size:.72rem; font-weight:600; color:#5A6A88; }
    .load-val-item span { font-size:1.05rem; font-weight:900; margin-left:3px; }
    .load-val-item.ctl span { color:${C_CTL}; }
    .load-val-item.atl span { color:${C_ATL}; }
    .load-val-item.tsb span { color:${C_TSB}; }

    .load-period-wrap { display:flex; background:#0C1220; border:1px solid #1A2640; border-radius:10px; padding:2px; gap:2px; }
    .load-period-btn { padding:5px 10px; font-size:.62rem; font-weight:700; border:none; border-radius:8px; background:transparent; color:#5A6A88; cursor:pointer; font-family:inherit; -webkit-tap-highlight-color:transparent; transition:all 200ms; }
    .load-period-btn.active { background:#101828; color:${C_CTL}; box-shadow:0 2px 8px rgba(0,0,0,.4); }

    .load-card { background:#101828; border:1px solid #1A2640; border-radius:18px; padding:14px 8px 12px; display:flex; flex-direction:column; gap:10px; }
    .load-chart-outer { width:100%; height:260px; position:relative; }
    .load-chart-outer svg { position:absolute; inset:0; width:100%; height:100%; display:block; overflow:visible; }

    .load-legend { display:flex; align-items:center; justify-content:center; gap:12px; flex-wrap:wrap; }
    .load-legend-item { display:flex; align-items:center; gap:5px; font-size:.6rem; color:#5A6A88; font-weight:500; }
    .load-leg-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .load-leg-bar { width:10px; height:6px; border-radius:2px; flex-shrink:0; }

    .load-tt { position:fixed; pointer-events:none; opacity:0; background:rgba(12,18,32,0.97); border:1px solid #1A2640; border-radius:10px; padding:10px 12px; z-index:9999; box-shadow:0 8px 24px rgba(0,0,0,.7); transition:opacity 120ms ease; min-width:180px; backdrop-filter:blur(6px); }
    .load-tt.vis { opacity:1; }
    .ltt-date { font-size:.65rem; font-weight:700; color:#CDD8EE; margin-bottom:6px; padding-bottom:5px; border-bottom:1px solid #1A2640; }
    .ltt-load-row { display:flex; justify-content:space-between; font-size:.68rem; font-weight:700; margin-bottom:4px; color:#5A6A88; }
    .ltt-act-row { display:flex; justify-content:space-between; gap:10px; font-size:.65rem; color:#8898BB; margin-bottom:2px; }
    .ltt-act-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .ltt-act-km { font-weight:700; color:#00D4C8; white-space:nowrap; }
    .ltt-divider { border-top:1px dashed #1A2640; margin:5px 0; }
    .ltt-row { display:flex; justify-content:space-between; gap:12px; font-size:.68rem; color:#5A6A88; margin-bottom:2px; font-weight:600; }
  `;
  document.head.appendChild(style);
}

// ── Fetch — uses start_time_utc (start_time_local is NULL) ─
async function fetchAllActivities() {
  const since = new Date();
  since.setFullYear(since.getFullYear() - 2);
  const sinceStr = since.toISOString();

  const cols = 'start_time_utc,training_load,sport_type,activity_name,distance_m,avg_hr';
  const url = SB_URL + '/rest/v1/activities?select=' + cols +
    '&start_time_utc=gte.' + sinceStr +
    '&order=start_time_utc.asc&limit=2000';

  const res = await fetch(url, {
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
  });
  if (!res.ok) throw new Error('Load fetch error ' + res.status);
  return res.json();
}

// ── Build PMC ──────────────────────────────────────────────
function buildPMC(activities) {
  if (!activities.length) return [];

  const byDate = {};
  activities.forEach(a => {
    // Use start_time_utc, slice to date
    const raw = a.start_time_utc;
    if (!raw) return;
    const d = raw.slice(0, 10);
    const tl = parseFloat(a.training_load) || 0;
    if (!byDate[d]) byDate[d] = { load: 0, acts: [] };
    byDate[d].load += tl;
    byDate[d].acts.push(a);
  });

  const dates = Object.keys(byDate).sort();
  if (!dates.length) return [];

  const end = new Date();
  const series = [];
  let ctl = 0, atl = 0;

  for (let d = new Date(dates[0] + 'T12:00:00Z'); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().slice(0, 10);
    const day = byDate[ds] || { load: 0, acts: [] };
    ctl = ctl + CTL_K * (day.load - ctl);
    atl = atl + ATL_K * (day.load - atl);
    series.push({
      date: ds,
      load: day.load,
      acts: day.acts,
      ctl:  +ctl.toFixed(1),
      atl:  +atl.toFixed(1),
      tsb:  +(ctl - atl).toFixed(1)
    });
  }
  return series;
}

// ── Draw ───────────────────────────────────────────────────
function drawPMC(series, months) {
  const outer = document.getElementById('load-chart-outer');
  if (!outer) return;
  const existing = outer.querySelector('svg');
  if (existing) existing.remove();

  const W = outer.clientWidth  || 340;
  const H = outer.clientHeight || 260;
  const pT = 10, pB = 26, pL = 36, pR = 60;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutStr = cutoff.toISOString().slice(0, 10);
  const visible = series.filter(d => d.date >= cutStr);
  if (!visible.length) return;

  const n = visible.length;
  const maxV = Math.max(...visible.map(d => Math.max(d.ctl, d.atl, d.load)), 10) + 8;
  const minV = Math.min(...visible.map(d => d.tsb), 0) - 8;

  const xS = i => pL + (i / Math.max(n - 1, 1)) * (W - pL - pR);
  const yS = v => pT + ((maxV - v) / (maxV - minV)) * (H - pT - pB);
  const y0 = yS(0);

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  Object.assign(svg.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', overflow:'visible' });

  const mk = (tag, attrs, txt) => {
    const el = document.createElementNS(ns, tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    if (txt !== undefined) el.textContent = txt;
    return el;
  };

  // Defs
  const defs = mk('defs');
  const grad = mk('linearGradient', { id:'ctl-fill', x1:0, y1:0, x2:0, y2:1 });
  grad.appendChild(mk('stop', { offset:'0%', 'stop-color':C_CTL, 'stop-opacity':'0.2' }));
  grad.appendChild(mk('stop', { offset:'100%', 'stop-color':C_CTL, 'stop-opacity':'0' }));
  defs.appendChild(grad); svg.appendChild(defs);

  // Optimal zone
  const yZ1 = yS(5), yZ2 = yS(-10);
  if (yZ2 > yZ1) svg.appendChild(mk('rect', { x:pL, y:yZ1, width:W-pL-pR, height:yZ2-yZ1, fill:'rgba(255,255,255,0.04)' }));

  // Zone labels
  [{ v:15, l:'Freshness' }, { v:0, l:'Neutral' }, { v:-8, l:'Optimal' }, { v:-25, l:'Overload' }].forEach(z => {
    const y = yS(z.v);
    if (y < pT - 5 || y > H - pB + 5) return;
    svg.appendChild(mk('line', { x1:pL, x2:W-pR, y1:y, y2:y, stroke:'rgba(255,255,255,0.08)', 'stroke-dasharray':'3,3', 'stroke-width':'0.8' }));
    svg.appendChild(mk('text', { x:W-pR+4, y:y+3, 'font-size':'7', fill:'rgba(255,255,255,0.22)', 'text-anchor':'start' }, z.l));
  });

  // Y ticks
  const step = (maxV - minV) > 80 ? 20 : (maxV - minV) > 40 ? 10 : 5;
  for (let t = Math.ceil(minV/step)*step; t <= maxV; t += step) {
    const y = yS(t);
    if (y < pT || y > H-pB) continue;
    svg.appendChild(mk('line', { x1:pL-3, x2:pL, y1:y, y2:y, stroke:'rgba(255,255,255,0.15)', 'stroke-width':'0.8' }));
    svg.appendChild(mk('text', { x:pL-5, y:y+3, 'font-size':'8', fill:'rgba(255,255,255,0.3)', 'text-anchor':'end' }, Math.round(t)));
  }

  // Zero line
  svg.appendChild(mk('line', { x1:pL, x2:W-pR, y1:y0, y2:y0, stroke:'rgba(255,255,255,0.2)', 'stroke-width':'1' }));

  // Load bars
  const barW = Math.max(1, Math.floor((W - pL - pR) / n) - 1);
  visible.forEach((d, i) => {
    if (!d.load) return;
    const bh = Math.max(1, y0 - yS(d.load));
    svg.appendChild(mk('rect', { x:xS(i)-barW/2, y:yS(d.load), width:barW, height:bh, fill:C_LOAD, opacity:'0.4', rx:'1' }));
  });

  // CTL area fill
  const ctlPts = visible.map((d, i) => xS(i)+','+yS(d.ctl)).join(' ');
  svg.appendChild(mk('polygon', { points: xS(0)+','+y0+' '+ctlPts+' '+xS(n-1)+','+y0, fill:'url(#ctl-fill)' }));

  // Lines helper
  const polyline = (key, color, width, dash) => {
    const el = mk('polyline', {
      points: visible.map((d,i) => xS(i)+','+yS(d[key])).join(' '),
      fill:'none', stroke:color, 'stroke-width':width,
      'stroke-linecap':'round', 'stroke-linejoin':'round'
    });
    if (dash) el.setAttribute('stroke-dasharray', dash);
    return el;
  };

  svg.appendChild(polyline('ctl', C_CTL, '2'));
  svg.appendChild(polyline('atl', C_ATL, '2'));
  svg.appendChild(polyline('tsb', C_TSB, '1.5'));

  // X date labels
  const every = n > 300 ? 60 : n > 150 ? 30 : n > 60 ? 14 : n > 30 ? 7 : 4;
  visible.forEach((d, i) => {
    if (i % every !== 0 && i !== n-1) return;
    const lbl = new Date(d.date+'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short' });
    svg.appendChild(mk('text', { x:xS(i), y:H-6, 'text-anchor':'middle', 'font-size':'7.5', fill:'rgba(255,255,255,0.3)' }, lbl));
  });

  // Interactive overlay
  const overlay = mk('rect', { x:pL, y:pT, width:W-pL-pR, height:H-pT-pB, fill:'transparent' });
  overlay.style.cursor = 'crosshair';
  const vLine = mk('line', { y1:pT, y2:H-pB, stroke:'rgba(255,255,255,0.35)', 'stroke-width':'1', 'stroke-dasharray':'3,2' });
  vLine.style.display = 'none';
  const ctlDot = mk('circle', { r:'4', fill:C_CTL }); ctlDot.style.display='none';
  const atlDot = mk('circle', { r:'4', fill:C_ATL }); atlDot.style.display='none';
  const tsbDot = mk('circle', { r:'4', fill:C_TSB }); tsbDot.style.display='none';
  [vLine, ctlDot, atlDot, tsbDot, overlay].forEach(el => svg.appendChild(el));

  const tt = document.getElementById('load-tt');

  const showTip = (clientX, clientY, localX) => {
    const idx = Math.max(0, Math.min(n-1, Math.round(((localX - pL) / (W-pL-pR)) * (n-1))));
    const pt = visible[idx];
    vLine.setAttribute('x1', xS(idx)); vLine.setAttribute('x2', xS(idx)); vLine.style.display='';
    ctlDot.setAttribute('cx', xS(idx)); ctlDot.setAttribute('cy', yS(pt.ctl)); ctlDot.style.display='';
    atlDot.setAttribute('cx', xS(idx)); atlDot.setAttribute('cy', yS(pt.atl)); atlDot.style.display='';
    tsbDot.setAttribute('cx', xS(idx)); tsbDot.setAttribute('cy', yS(pt.tsb)); tsbDot.style.display='';
    const dls = new Date(pt.date+'T12:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
    const actRows = pt.acts.map(a => {
      const km = a.distance_m ? (a.distance_m/1000).toFixed(1)+' km' : '';
      return `<div class="ltt-act-row"><span class="ltt-act-name">${sportLabel(a.sport_type)}${a.activity_name ? ' · '+a.activity_name : ''}</span><span class="ltt-act-km">${km}</span></div>`;
    }).join('');
    tt.innerHTML = `
      <div class="ltt-date">${dls}</div>
      ${pt.load ? `<div class="ltt-load-row"><span>Load</span><span style="color:${C_LOAD}">${pt.load.toFixed(0)}</span></div>` : ''}
      ${actRows}
      <div class="ltt-divider"></div>
      <div class="ltt-row"><span>Fitness (CTL)</span><span style="color:${C_CTL}">${pt.ctl.toFixed(1)}</span></div>
      <div class="ltt-row"><span>Fatigue (ATL)</span><span style="color:${C_ATL}">${pt.atl.toFixed(1)}</span></div>
      <div class="ltt-row"><span>Form (TSB)</span><span style="color:${C_TSB}">${(pt.tsb>0?'+':'')+pt.tsb.toFixed(1)}</span></div>`;
    tt.style.left = Math.min(clientX+14, window.innerWidth-200)+'px';
    tt.style.top  = Math.max(8, clientY-60)+'px';
    tt.classList.add('vis');
  };

  overlay.addEventListener('mousemove', e => {
    const r = svg.getBoundingClientRect();
    showTip(e.clientX, e.clientY, e.clientX - r.left);
  });
  overlay.addEventListener('touchmove', e => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    const t = e.touches[0];
    showTip(t.clientX, t.clientY, t.clientX - r.left);
  }, { passive:false });
  overlay.addEventListener('mouseleave', () => {
    vLine.style.display='none'; ctlDot.style.display='none';
    atlDot.style.display='none'; tsbDot.style.display='none';
    tt.classList.remove('vis');
  });

  outer.appendChild(svg);

  // Header values
  const last = visible[visible.length-1];
  const ce = document.getElementById('load-ctl-val');
  const ae = document.getElementById('load-atl-val');
  const te = document.getElementById('load-tsb-val');
  if (ce) ce.textContent = last.ctl.toFixed(1);
  if (ae) ae.textContent = last.atl.toFixed(1);
  if (te) {
    te.textContent = (last.tsb>0?'+':'')+last.tsb.toFixed(1);
    te.style.color = last.tsb > 5 ? '#7ED4A0' : last.tsb < -20 ? '#FF5A6E' : C_TSB;
  }
}

// ── Public ─────────────────────────────────────────────────
export function loadSetPeriod(months) {
  ls.activePeriod = months;
  document.querySelectorAll('.load-period-btn').forEach(b =>
    b.classList.toggle('active', +b.dataset.m === months));
  if (ls.pmcSeries) drawPMC(ls.pmcSeries, months);
}
window.loadSetPeriod = loadSetPeriod;

export async function renderLoad() {
  injectStyles();

  const container = document.getElementById('panel-load');
  container.innerHTML = `
    <div class="load-header">
      <div>
        <div class="load-eyebrow">Training Load</div>
        <div class="load-pmc-vals">
          <span class="load-val-item ctl">Fitness <span id="load-ctl-val">—</span></span>
          <span class="load-val-item atl">Fatigue <span id="load-atl-val">—</span></span>
          <span class="load-val-item tsb">Form <span id="load-tsb-val">—</span></span>
        </div>
      </div>
      <div class="load-period-wrap">
        ${PERIODS.map(p => `<button class="load-period-btn${p.months===DEFAULT_PERIOD?' active':''}" data-m="${p.months}" onclick="loadSetPeriod(${p.months})">${p.label}</button>`).join('')}
      </div>
    </div>
    <div class="load-card">
      <div id="load-chart-outer" class="load-chart-outer"></div>
      <div class="load-legend">
        <div class="load-legend-item"><div class="load-leg-dot" style="background:${C_CTL}"></div>Fitness (CTL)</div>
        <div class="load-legend-item"><div class="load-leg-dot" style="background:${C_ATL}"></div>Fatigue (ATL)</div>
        <div class="load-legend-item"><div class="load-leg-dot" style="background:${C_TSB}"></div>Form (TSB)</div>
        <div class="load-legend-item"><div class="load-leg-bar" style="background:${C_LOAD}"></div>Load</div>
      </div>
    </div>
    <div id="load-tt" class="load-tt"></div>
  `;

  try {
    if (!ls.fetched) {
      ls.allActivities = await fetchAllActivities();
      ls.fetched = true;
    }
    ls.pmcSeries = buildPMC(ls.allActivities);

    if (!ls.pmcSeries.length) {
      document.getElementById('load-chart-outer').innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#5A6A88;font-size:.8rem;">No activity data found</div>';
      return;
    }

    const outer = document.getElementById('load-chart-outer');
    if (outer.clientWidth > 0) {
      drawPMC(ls.pmcSeries, ls.activePeriod);
    } else {
      const ro = new ResizeObserver(entries => {
        for (const e of entries) {
          if (e.contentRect.width > 0) { ro.disconnect(); drawPMC(ls.pmcSeries, ls.activePeriod); }
        }
      });
      ro.observe(outer);
    }
  } catch (e) {
    console.error(e);
    document.getElementById('panel-load').innerHTML =
      '<div style="padding:24px;text-align:center;color:#FF5A6E;font-size:.8rem;">⚠️ ' + e.message + '</div>';
  }
}
