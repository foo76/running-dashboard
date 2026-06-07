import { state, SB_URL, SB_KEY, localDate } from './shared.js';

export const dashboardHTML = `
  <div class="dash-section-title">HRV Status</div>

  <div class="hrv-card" id="hrv-card">

    <div class="hrv-status-row">
      <div class="hrv-status-dot" id="hrv-status-dot"></div>
      <div class="hrv-status-label" id="hrv-status-label">—</div>
    </div>

    <div class="hrv-main-row">
      <div class="hrv-big-val" id="hrv-big-val">—</div>
      <div class="hrv-big-unit">ms</div>
    </div>
    <div class="hrv-avg-label">7d Avg</div>

    <div class="hrv-range-bar-wrap" id="hrv-range-bar-wrap">
      <div class="hrv-range-track">
        <div class="hrv-range-seg low"></div>
        <div class="hrv-range-seg unbalanced"></div>
        <div class="hrv-range-seg balanced"></div>
        <div class="hrv-range-seg unbalanced"></div>
        <div class="hrv-range-seg low"></div>
      </div>
      <div class="hrv-range-marker" id="hrv-range-marker"></div>
    </div>

    <div class="hrv-sparkline-wrap">
      <svg id="hrv-spark-svg" class="hrv-spark-svg"></svg>
    </div>
    <div class="hrv-spark-label">Last 4w</div>

  </div>
`;

function statusMeta(status, hrv, avg) {
  if (!status) return { label: 'Unknown', color: '#5A6A88' };
  const s = status.toUpperCase();
  if (s === 'BALANCED')   return { label: 'Balanced',   color: '#4CAF50' };
  if (s === 'UNBALANCED') return { label: 'Unbalanced', color: '#F5C842' };
  if (s === 'LOW')        return { label: 'Low',        color: '#FF5A6E' };
  return { label: status, color: '#5A6A88' };
}

function renderHrvRangeMarker(avg, rows) {
  // Build personal range from last 28 days
  const vals = rows.map(r => parseFloat(r.hrv_last_night)).filter(v => !isNaN(v));
  if (!vals.length || !avg) return;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  // Marker position: where avg sits within min..max, mapped to 10%–90% of bar
  const pct = 10 + ((avg - min) / range) * 80;
  const marker = document.getElementById('hrv-range-marker');
  if (marker) marker.style.left = Math.max(4, Math.min(96, pct)) + '%';
}

function renderHrvSparkline(rows) {
  const svg = document.getElementById('hrv-spark-svg');
  if (!svg) return;
  const W = svg.clientWidth || 260, H = svg.clientHeight || 60;
  const vals = rows.map(r => parseFloat(r.hrv_last_night)).filter(v => !isNaN(v));
  if (vals.length < 2) return;

  // Use last 28 rows
  const data = rows.slice(-28).map(r => parseFloat(r.hrv_last_night));
  const avg  = rows.slice(-28).map(r => parseFloat(r.hrv_weekly_avg));
  const validData = data.filter(v => !isNaN(v));
  const minV = Math.min(...validData) - 3, maxV = Math.max(...validData) + 3;
  const n = data.length;

  const xS = i => (i / (n - 1)) * W;
  const yS = v => H - ((v - minV) / (maxV - minV)) * H;

  // Clear
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const ns = 'http://www.w3.org/2000/svg';

  // Shaded area under avg line
  const avgPts = avg.map((v, i) => isNaN(v) ? null : [xS(i), yS(v)]).filter(Boolean);
  if (avgPts.length > 1) {
    const areaD = 'M' + avgPts[0][0] + ',' + H +
      ' L' + avgPts.map(p => p[0] + ',' + p[1]).join(' L') +
      ' L' + avgPts[avgPts.length - 1][0] + ',' + H + ' Z';
    const area = document.createElementNS(ns, 'path');
    area.setAttribute('d', areaD);
    area.setAttribute('fill', 'rgba(76,175,80,0.12)');
    svg.appendChild(area);

    const avgPath = document.createElementNS(ns, 'path');
    avgPath.setAttribute('d', 'M' + avgPts.map(p => p.join(',')).join(' L'));
    avgPath.setAttribute('fill', 'none');
    avgPath.setAttribute('stroke', 'rgba(76,175,80,0.35)');
    avgPath.setAttribute('stroke-width', '1.5');
    avgPath.setAttribute('stroke-dasharray', '3,2');
    svg.appendChild(avgPath);
  }

  // Dots for each day
  data.forEach((v, i) => {
    if (isNaN(v)) return;
    const avgV = avg[i];
    const isAbove = !isNaN(avgV) ? v >= avgV : true;
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', xS(i));
    circle.setAttribute('cy', yS(v));
    circle.setAttribute('r', i === data.length - 1 ? 4 : 2.5);
    circle.setAttribute('fill', isAbove ? '#4CAF50' : '#F5C842');
    svg.appendChild(circle);
  });
}

export async function fetchDashboardData() {
  const since = localDate(28);
  const cols = 'date,hrv_last_night,hrv_weekly_avg,hrv_status';
  const url = SB_URL + '/rest/v1/wellness_daily?select=' + cols +
    '&date=gte.' + since + '&order=date.asc';
  const res = await fetch(url, {
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
  });
  if (!res.ok) throw new Error('Dashboard fetch error ' + res.status);
  return res.json();
}

export async function renderDashboard() {
  const container = document.getElementById('panel-dashboard');
  container.innerHTML = dashboardHTML;

  try {
    // Use already-fetched allRows if available, else fetch dedicated
    let rows = state.allRows.length ? state.allRows : await fetchDashboardData();

    const today = rows[rows.length - 1];
    if (!today) return;

    const avg    = parseFloat(today.hrv_weekly_avg);
    const meta   = statusMeta(today.hrv_status, parseFloat(today.hrv_last_night), avg);

    // Status dot + label
    const dot   = document.getElementById('hrv-status-dot');
    const label = document.getElementById('hrv-status-label');
    if (dot)   { dot.style.background = meta.color; }
    if (label) { label.textContent = meta.label; label.style.color = meta.color; }

    // Big value
    const bigVal = document.getElementById('hrv-big-val');
    if (bigVal) bigVal.textContent = isNaN(avg) ? '—' : avg.toFixed(0);

    // Range marker
    renderHrvRangeMarker(avg, rows);

    // Sparkline
    requestAnimationFrame(() => renderHrvSparkline(rows));

  } catch (e) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--low);font-size:.8rem;">⚠️ ' + e.message + '</div>';
  }
}
