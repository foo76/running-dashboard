import { state, SB_URL, SB_KEY, fmtDate, getMonday, clamp } from './shared.js';

export const volumeHTML = `
  <div class="vol-header">
    <div class="vol-title-group">
      <span class="vol-eyebrow">Running</span>
      <span class="vol-heading">Volume Heatmap</span>
    </div>
    <div class="vol-period-wrap" role="group" aria-label="Period selector">
      <button class="vol-period-btn" data-m="1" onclick="volSetPeriod(1)">1M</button>
      <button class="vol-period-btn active" data-m="3" onclick="volSetPeriod(3)">3M</button>
      <button class="vol-period-btn" data-m="6" onclick="volSetPeriod(6)">6M</button>
    </div>
  </div>

  <div class="vol-scheme-row">
    <span class="vol-scheme-lbl" id="vsl-green">🟢 Green</span>
    <label class="vol-toggle-pill" aria-label="Toggle colour scheme">
      <input type="checkbox" id="vol-scheme-chk" onchange="volToggleScheme()" checked>
      <div class="vol-pill-track"></div>
      <div class="vol-pill-thumb"></div>
    </label>
    <span class="vol-scheme-lbl on" id="vsl-heat">🔴 Heat</span>
  </div>

  <div class="vol-card" id="vol-card">
    <div class="vol-skel sk" id="vol-skel"></div>
    <div id="vol-grid-wrap" style="display:none">
      <div class="vol-grid-outer">
        <div class="vol-day-labels">
          <div class="vol-day-lbl">Mon</div>
          <div class="vol-day-lbl">Tue</div>
          <div class="vol-day-lbl">Wed</div>
          <div class="vol-day-lbl">Thu</div>
          <div class="vol-day-lbl">Fri</div>
          <div class="vol-day-lbl">Sat</div>
          <div class="vol-day-lbl">Sun</div>
        </div>
        <div class="vol-grid-area" id="vol-grid-area">
          <div class="vol-month-row" id="vol-month-row"></div>
          <div class="vol-cell-grid" id="vol-cell-grid"></div>
        </div>
      </div>
      <div class="vol-legend-wrap">
        <span class="vol-legend-end">Less</span>
        <div class="vol-legend-bar" id="vol-legend-bar"></div>
        <span class="vol-legend-end">More</span>
        <span class="vol-legend-max" id="vol-legend-max"></span>
      </div>
    </div>
    <div class="vol-empty" id="vol-empty" style="display:none">
      <div class="vol-empty-icon">🏃</div>
      <div class="vol-empty-msg" id="vol-empty-msg">No running data found for this period.</div>
    </div>
  </div>

  <div class="vol-stats-row" id="vol-stats-row" style="opacity:0;transition:opacity 400ms;">
    <div class="vol-stat">
      <div class="vol-stat-lbl">Total</div>
      <div class="vol-stat-val" id="vstat-total">—</div>
      <div class="vol-stat-unit">km</div>
    </div>
    <div class="vol-stat">
      <div class="vol-stat-lbl">Avg / Week</div>
      <div class="vol-stat-val" id="vstat-weekly">—</div>
      <div class="vol-stat-unit">km</div>
    </div>
    <div class="vol-stat">
      <div class="vol-stat-lbl">Best Day</div>
      <div class="vol-stat-val" id="vstat-best">—</div>
      <div class="vol-stat-unit">km</div>
    </div>
  </div>

  <div class="yoy-section">
    <div class="yoy-card">
      <div class="yoy-title">Cumulative Running Distance by Month</div>
      <div id="yoy-skel" class="yoy-skel"></div>
      <div id="yoy-chart-wrap" class="yoy-chart-wrap" style="display:none;">
        <svg id="yoy-svg" class="yoy-svg"></svg>
      </div>
      <div id="yoy-legend" class="yoy-legend"></div>
      <div class="yoy-controls">
        <button class="yoy-toggle-all" id="yoy-toggle-all" onclick="yoyToggleAll()">Hide All</button>
      </div>
    </div>
  </div>
`;

// Helper for cell colours
function hexRgb(h) {
  const s = h.replace('#', '');
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
}
function lerpColour(h1, h2, t) {
  const c1 = hexRgb(h1), c2 = hexRgb(h2);
  return `rgb(${Math.round(c1.r + (c2.r - c1.r) * t)},${Math.round(c1.g + (c2.g - c1.g) * t)},${Math.round(c1.b + (c2.b - c1.b) * t)})`;
}
function cellColour(ratio, scheme) {
  if (ratio <= 0) return scheme === 'heat' ? '#0d1520' : '#091210';
  const t = Math.pow(clamp(ratio, 0, 1), 0.65);
  if (scheme === 'heat') return t < 0.5 ? lerpColour('#1a5e35', '#F5C842', t * 2) : lerpColour('#F5C842', '#FF3040', (t - 0.5) * 2);
  return lerpColour('#0a2e1a', '#00E87A', t);
}
function legendGradient(scheme) {
  return scheme === 'heat' ? 'linear-gradient(to right,#0d1520,#1a5e35,#F5C842,#FF3040)' : 'linear-gradient(to right,#091210,#0a2e1a,#167a3a,#00E87A)';
}

export async function fetchVolumeData(sinceDateStr) {
  const cols = 'activity_name,strava_activity_name,start_time_utc,distance_m,activity_type';
  const types = 'running,trail_running,treadmill_running';
  const url = `${SB_URL}/rest/v1/activities?select=${cols}&start_time_utc=gte.${sinceDateStr}T00:00:00Z&activity_type=in.(${types})&order=start_time_utc.asc&limit=2000`;
  const res = await fetch(url, { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } });
  if (!res.ok) throw new Error(`Activities API error ${res.status}`);
  const data = await res.json();
  return data.map(row => ({
    date: row.start_time_utc ? row.start_time_utc.slice(0, 10) : null,
    name: row.strava_activity_name || row.activity_name || 'Run',
    km: row.distance_m ? +(row.distance_m / 1000).toFixed(2) : 0
  })).filter(r => r.date && r.km > 0.1);
}

export function renderHeatmapGrid(weeks, dayMap, maxKm, scheme) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = fmtDate(today), currentMonStr = fmtDate(getMonday(today));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const volTT = document.getElementById('vol-tt');
  const vttDate = document.getElementById('vtt-date'), vttActs = document.getElementById('vtt-acts');
  const gridArea = document.getElementById('vol-grid-area');
  const n = weeks.length || 1, COL_GAP = 3;
  let availW = gridArea ? gridArea.clientWidth : 0;
  if (availW < 10) availW = (window.innerWidth || 375) - 60;
  const rawCell = (availW - (n - 1) * COL_GAP) / n;
  const cellSize = Math.max(8, Math.min(28, Math.floor(rawCell)));
  const radius = cellSize <= 10 ? 2 : cellSize <= 16 ? 3 : 5;
  const fontSize = cellSize <= 10 ? '.42rem' : cellSize <= 16 ? '.52rem' : '.6rem';

  document.querySelectorAll('.vol-day-lbl').forEach((el, i, arr) => {
    el.style.height = cellSize + 'px'; el.style.lineHeight = cellSize + 'px';
    el.style.marginBottom = i < arr.length - 1 ? COL_GAP + 'px' : '0';
    el.style.fontSize = fontSize;
  });

  const monthRow = document.getElementById('vol-month-row');
  monthRow.innerHTML = ''; let lastMonth = -1;
  weeks.forEach(wk => {
    const mo = wk[0].getMonth(), span = document.createElement('div');
    span.className = 'vol-month-lbl'; span.style.cssText = 'width:' + cellSize + 'px;flex-shrink:0;overflow:hidden;';
    span.textContent = (mo !== lastMonth) ? MONTHS[mo] : ''; if (mo !== lastMonth) lastMonth = mo;
    monthRow.appendChild(span);
  });

  const grid = document.getElementById('vol-cell-grid'); grid.innerHTML = '';
  weeks.forEach(wk => {
    const wkMonStr = fmtDate(wk[0]), isCurrentWeek = wkMonStr === currentMonStr;
    const col = document.createElement('div'); col.className = 'vol-week-col';
    wk.forEach(day => {
      const ds = fmtDate(day), isFuture = ds > todayStr, acts = dayMap[ds] || [], totalKm = acts.reduce((s, a) => s + a.km, 0);
      const ratio = (maxKm > 0 && totalKm > 0) ? totalKm / maxKm : 0;
      const cell = document.createElement('div'); cell.className = 'vol-cell';
      cell.style.width = cellSize + 'px'; cell.style.height = cellSize + 'px'; cell.style.borderRadius = radius + 'px';
      if (isCurrentWeek) cell.classList.add('current-week');
      if (isFuture) { cell.classList.add('future'); cell.style.background = '#0b1117'; }
      else cell.style.background = cellColour(ratio, scheme);
      if (totalKm > 0) cell.classList.add('has-run');
      if (!isFuture && ratio > 0.65) { const a = ((ratio - 0.65) / 0.35 * 0.6).toFixed(2); cell.style.boxShadow = scheme === 'heat' ? '0 0 5px 1px rgba(255,48,64,' + a + ')' : '0 0 5px 1px rgba(0,232,122,' + a + ')'; }
      if (totalKm > 0 && !isFuture) {
        const buildTT = () => {
          const d = new Date(ds + 'T12:00:00'); vttDate.textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
          vttActs.innerHTML = ''; acts.forEach(a => { const r = document.createElement('div'); r.className = 'vtt-row'; r.innerHTML = '<span class="vtt-name">' + a.name + '</span><span class="vtt-km">' + a.km.toFixed(2) + ' km</span>'; vttActs.appendChild(r); });
          if (acts.length > 1) { const t = document.createElement('div'); t.className = 'vtt-total-row'; t.innerHTML = '<span class="vtt-total-lbl">Total</span><span class="vtt-total-val">' + totalKm.toFixed(2) + ' km</span>'; vttActs.appendChild(t); }
        };
        const posTT = (el) => { const r = el.getBoundingClientRect(), ttW = 185; let l = r.right + 8; if (l + ttW > window.innerWidth - 8) l = r.left - ttW - 8; volTT.style.left = Math.max(8, l) + 'px'; volTT.style.top = Math.min(r.top, window.innerHeight - 220) + 'px'; };
        cell.addEventListener('mouseenter', () => { buildTT(); posTT(cell); volTT.classList.add('vis'); });
        cell.addEventListener('mouseleave', () => volTT.classList.remove('vis'));
        cell.addEventListener('touchstart', e => { e.stopPropagation(); buildTT(); const t = e.touches[0]; let l = t.clientX + 12; if (l + 190 > window.innerWidth - 8) l = t.clientX - 195; volTT.style.left = Math.max(8, l) + 'px'; volTT.style.top = Math.max(8, t.clientY - 70) + 'px'; volTT.classList.add('vis'); }, { passive: true });
      }
      col.appendChild(cell);
    });
    grid.appendChild(col);
  });
  document.getElementById('vol-legend-bar').style.background = legendGradient(scheme);
  document.getElementById('vol-legend-max').textContent = maxKm > 0 ? 'max ' + maxKm.toFixed(1) + ' km' : '';
}

export function renderVolume() {
  const container = document.getElementById('panel-volume');
  if (container.innerHTML.trim() === '') container.innerHTML = volumeHTML;

  const skel = document.getElementById('vol-skel'), gridWrap = document.getElementById('vol-grid-wrap'), emptyEl = document.getElementById('vol-empty'), emptyMsg = document.getElementById('vol-empty-msg'), statsRow = document.getElementById('vol-stats-row');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const periodStart = new Date(today); periodStart.setMonth(periodStart.getMonth() - state.volPeriodMonths);
  const gridStart = getMonday(periodStart), currentMon = getMonday(today);
  const weeks = []; const cursor = new Date(gridStart);
  while (cursor <= currentMon) { const wk = []; for (let d = 0; d < 7; d++) { const day = new Date(cursor); day.setDate(day.getDate() + d); wk.push(day); } weeks.push(wk); cursor.setDate(cursor.getDate() + 7); }
  const sinceStr = fmtDate(gridStart), filtered = state.volRawRows.filter(r => r.date >= sinceStr), dayMap = {};
  filtered.forEach(r => { if (!dayMap[r.date]) dayMap[r.date] = []; dayMap[r.date].push({ name: r.name, km: r.km }); });
  let maxKm = 0; Object.values(dayMap).forEach(acts => { const t = acts.reduce((s, a) => s + a.km, 0); if (t > maxKm) maxKm = t; });
  if (filtered.length === 0) { skel.style.display = 'none'; gridWrap.style.display = 'none'; emptyEl.style.display = 'flex'; if (emptyMsg) emptyMsg.textContent = `No data found in last ${state.volPeriodMonths}M.`; statsRow.style.opacity = '0'; return; }
  emptyEl.style.display = 'none'; skel.style.display = 'none'; gridWrap.style.display = 'block';
  requestAnimationFrame(() => requestAnimationFrame(() => { renderHeatmapGrid(weeks, dayMap, maxKm, state.volScheme); }));
  const totalKm = filtered.reduce((s, r) => s + r.km, 0), avgWeekly = weeks.length > 0 ? totalKm / weeks.length : 0;
  document.getElementById('vstat-total').textContent = totalKm >= 1000 ? (totalKm / 1000).toFixed(1) + 'k' : totalKm.toFixed(1);
  document.getElementById('vstat-weekly').textContent = avgWeekly.toFixed(1);
  document.getElementById('vstat-best').textContent = maxKm.toFixed(1);
  statsRow.style.opacity = '1';
}

export async function fetchAndRenderVolume() {
  if (state.volFetching) return; state.volFetching = true;
  const container = document.getElementById('panel-volume');
  if (container.innerHTML.trim() === '') container.innerHTML = volumeHTML;
  const skel = document.getElementById('vol-skel'), gridWrap = document.getElementById('vol-grid-wrap'), emptyEl = document.getElementById('vol-empty'), emptyMsg = document.getElementById('vol-empty-msg');
  skel.style.display = 'block'; gridWrap.style.display = 'none'; emptyEl.style.display = 'none';
  try {
    const since = new Date(); since.setMonth(since.getMonth() - 7); since.setDate(1);
    state.volRawRows = await fetchVolumeData(fmtDate(since));
    if (state.volRawRows.length === 0) { skel.style.display = 'none'; emptyEl.style.display = 'flex'; if (emptyMsg) emptyMsg.textContent = 'No activities found.'; }
    else { renderVolume(); if (!state.yoyFetched) { state.yoyFetched = true; fetchAndRenderYoY(); } }
  } catch (e) { skel.style.display = 'none'; emptyEl.style.display = 'flex'; emptyEl.innerHTML = '<div class="vol-empty-icon">⚠️</div><div class="vol-empty-msg">' + e.message + '</div>'; }
  finally { state.volFetching = false; }
}

export function volSetPeriod(months) {
  state.volPeriodMonths = months;
  document.querySelectorAll('.vol-period-btn').forEach(b => b.classList.toggle('active', +b.dataset.m === months));
  if (state.volRawRows.length > 0) renderVolume();
}
window.volSetPeriod = volSetPeriod;

export function volToggleScheme() {
  const checked = document.getElementById('vol-scheme-chk').checked;
  state.volScheme = checked ? 'heat' : 'green';
  document.getElementById('vsl-green').classList.toggle('on', !checked);
  document.getElementById('vsl-heat').classList.toggle('on', checked);
  if (state.volRawRows.length > 0) renderVolume();
}
window.volToggleScheme = volToggleScheme;

// YoY Implementation
export async function fetchYoYData() {
  const cols = 'distance_m,start_time_utc';
  const types = 'running,trail_running,treadmill_running';
  let all = [], offset = 0, limit = 1000;
  while (true) {
    const url = `${SB_URL}/rest/v1/activities?select=${cols}&activity_type=in.(${types})&order=start_time_utc.asc&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } });
    if (!res.ok) throw new Error('YoY Fetch Error');
    const data = await res.json();
    all = all.concat(data);
    if (data.length < limit) break;
    offset += limit;
  }
  const years = {};
  all.forEach(r => {
    const d = new Date(r.start_time_utc); if (isNaN(d)) return;
    const yr = d.getFullYear(), m = d.getMonth(), day = d.getDate(), dist = (r.distance_m || 0) / 1000;
    if (!years[yr]) { years[yr] = Array.from({ length: 12 }, () => ({ dist: 0, count: 0 })); }
    years[yr][m].dist += dist; years[yr][m].count++;
  });
  Object.keys(years).forEach(yr => {
    let cum = 0;
    years[yr] = years[yr].map((m, i) => { cum += m.dist; return { month: i, cum: +cum.toFixed(2), dist: +m.dist.toFixed(2) }; });
  });
  return years;
}

export function buildYoYChart(data) {
  const wrap = document.getElementById('yoy-chart-wrap'); if (!wrap) return;
  const svg = d3.select('#yoy-svg'); svg.selectAll('*').remove();
  const W = wrap.clientWidth || 340, H = wrap.clientHeight || 180, pT = 10, pB = 25, pL = 35, pR = 15, iW = W - pL - pR, iH = H - pT - pB;
  const years = Object.keys(data).map(Number).sort((a, b) => a - b);
  let maxCum = 0; years.forEach(yr => { const last = data[yr][11].cum; if (last > maxCum) maxCum = last; });
  const xS = d3.scaleLinear().domain([0, 11]).range([pL, W - pR]), yS = d3.scaleLinear().domain([0, maxCum * 1.05]).range([H - pB, pT]);
  const colMap = {}; const colors = ['#00D4C8', '#FF5A6E', '#F5C842', '#7B9EFF', '#A78BFF', '#00E5A0', '#FF8B5A'];
  years.forEach((yr, i) => colMap[yr] = colors[i % colors.length]);
  const line = d3.line().x(d => xS(d.month)).y(d => yS(d.cum)).curve(d3.curveMonotoneX);
  [0, 0.25, 0.5, 0.75, 1].forEach(p => { const v = Math.round(maxCum * p), y = yS(v); svg.append('line').attr('x1', pL).attr('x2', W - pR).attr('y1', y).attr('y2', y).attr('stroke', 'var(--border)').attr('stroke-width', 0.5).attr('stroke-dasharray', '2,2'); svg.append('text').attr('x', pL - 5).attr('y', y + 3).attr('text-anchor', 'end').attr('font-size', '7px').attr('fill', 'var(--dim)').text(v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v); });
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  MONTHS.forEach((m, i) => { svg.append('text').attr('x', xS(i)).attr('y', H - 8).attr('text-anchor', 'middle').attr('font-size', '7px').attr('fill', 'var(--dim)').text(m[0]); });
  years.forEach(yr => {
    const grp = svg.append('g').attr('class', 'yoy-line-grp').attr('data-year', yr).style('opacity', state.yoyHidden.has(yr) ? 0 : 1);
    grp.append('path').datum(data[yr]).attr('d', line).attr('fill', 'none').attr('stroke', colMap[yr]).attr('stroke-width', 2.5).attr('stroke-linecap', 'round');
    const last = data[yr][11]; grp.append('circle').attr('cx', xS(11)).attr('cy', yS(last.cum)).attr('r', 3).attr('fill', colMap[yr]);
  });
  const legend = document.getElementById('yoy-legend'); legend.innerHTML = '';
  years.forEach(yr => { const pill = document.createElement('div'); pill.className = 'yoy-pill' + (state.yoyHidden.has(yr) ? ' hidden' : ''); pill.dataset.year = yr; pill.innerHTML = '<div class="yoy-pill-dot" style="background:' + colMap[yr] + '"></div><span class="yoy-pill-lbl">' + yr + '</span>'; pill.addEventListener('click', () => yoyToggleYear(yr)); legend.appendChild(pill); });
  document.getElementById('yoy-toggle-all').textContent = years.every(yr => state.yoyHidden.has(yr)) ? 'Show All' : 'Hide All';
}

export function yoyToggleYear(yr) {
  if (state.yoyHidden.has(yr)) state.yoyHidden.delete(yr); else state.yoyHidden.add(yr);
  d3.selectAll('.yoy-line-grp[data-year="' + yr + '"]').style('opacity', state.yoyHidden.has(yr) ? 0 : 1);
  document.querySelectorAll('.yoy-pill[data-year="' + yr + '"]').forEach(p => p.classList.toggle('hidden', state.yoyHidden.has(yr)));
  const years = Object.keys(state.yoyData).map(Number);
  document.getElementById('yoy-toggle-all').textContent = years.every(y => state.yoyHidden.has(y)) ? 'Show All' : 'Hide All';
}
window.yoyToggleYear = yoyToggleYear;

export function yoyToggleAll() {
  const years = Object.keys(state.yoyData).map(Number);
  const allHid = years.every(yr => state.yoyHidden.has(yr));
  if (allHid) years.forEach(yr => state.yoyHidden.delete(yr)); else years.forEach(yr => state.yoyHidden.add(yr));
  years.forEach(yr => { d3.selectAll('.yoy-line-grp[data-year="' + yr + '"]').style('opacity', state.yoyHidden.has(yr) ? 0 : 1); document.querySelectorAll('.yoy-pill[data-year="' + yr + '"]').forEach(p => p.classList.toggle('hidden', state.yoyHidden.has(yr))); });
  document.getElementById('yoy-toggle-all').textContent = allHid ? 'Hide All' : 'Show All';
}
window.yoyToggleAll = yoyToggleAll;

export async function fetchAndRenderYoY() {
  const skel = document.getElementById('yoy-skel'), wrap = document.getElementById('yoy-chart-wrap');
  try {
    skel.style.display = 'block'; wrap.style.display = 'none';
    state.yoyData = await fetchYoYData();
    skel.style.display = 'none'; wrap.style.display = 'block';
    requestAnimationFrame(() => requestAnimationFrame(() => buildYoYChart(state.yoyData)));
  } catch (e) { skel.style.display = 'none'; wrap.style.display = 'block'; wrap.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,.35);padding:40px 0;font-size:.75rem;">' + e.message + '</p>'; }
}

(function () {
  let _rt; window.addEventListener('resize', function () {
    clearTimeout(_rt); _rt = setTimeout(function () {
      if (state.volRawRows.length > 0 && document.getElementById('vol-grid-wrap').style.display !== 'none') renderVolume();
      if (state.yoyData && document.getElementById('yoy-chart-wrap').style.display !== 'none') buildYoYChart(state.yoyData);
    }, 150);
  });
})();
