import { SB_URL, SB_KEY, localDate } from './shared.js';
import { renderGctDial } from './widget-gct.js';

export const dashboardHTML = `
  <div class="dash-section-title">GCT Balance</div>

  <div class="gct-card" id="gct-card">
    <div class="gct-dial-wrap" id="gct-dial-wrap"></div>

    <div class="gct-change-row" id="gct-change-row">
      <span class="gct-change-label">30d Change</span>
      <span class="gct-change-val" id="gct-change-val">—</span>
    </div>
  </div>
`;

export async function fetchDashboardData() {
  const since = localDate(30);
  const cols = 'run_date,gct_left_pct';
  const url = SB_URL + '/rest/v1/gct_balance_view?select=' + cols +
    '&run_date=gte.' + since + '&order=run_date.asc';

  const res = await fetch(url, {
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY
    }
  });

  if (!res.ok) throw new Error('GCT fetch error ' + res.status);
  return res.json();
}

function avg(arr) {
  if (!arr.length) return NaN;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

export async function renderDashboard() {
  const container = document.getElementById('panel-dashboard');
  container.innerHTML = dashboardHTML;

  try {
    const rows = await fetchDashboardData();

    if (!rows || !rows.length) {
      const wrap = document.getElementById('gct-dial-wrap');
      if (wrap) {
        wrap.innerHTML =
          '<div style="color:var(--label);font-size:.78rem;text-align:center;padding:24px">No GCT Balance data available</div>';
      }
      return;
    }

    const vals = rows
      .map(r => parseFloat(r.gct_left_pct))
      .filter(v => !isNaN(v));

    if (!vals.length) {
      const wrap = document.getElementById('gct-dial-wrap');
      if (wrap) {
        wrap.innerHTML =
          '<div style="color:var(--label);font-size:.78rem;text-align:center;padding:24px">No valid GCT Balance values found</div>';
      }
      return;
    }

    // Current 30-day rolling average
    const avg30 = avg(vals);

    // Change over the same 30-day period:
    // first half average vs last half average
    const split = Math.ceil(vals.length / 2);
    const firstHalf = vals.slice(0, split);
    const lastHalf = vals.slice(split);

    const avgFirst = avg(firstHalf);
    const avgLast = avg(lastHalf.length ? lastHalf : firstHalf);
    const change = avgLast - avgFirst;

    renderGctDial('gct-dial-wrap', avg30);

    const changeEl = document.getElementById('gct-change-val');
    if (changeEl) {
      const sign = change > 0 ? '+' : '';
      const dir =
        Math.abs(change) < 0.05 ? 'Stable' :
        change > 0 ? '→ Left' : '→ Right';

      const colour =
        Math.abs(change) < 0.05 ? 'var(--label)' :
        change > 0 ? '#3b82f6' : '#f97316';

      changeEl.textContent = dir + ' ' + sign + change.toFixed(2) + '%';
      changeEl.style.color = colour;
    }

  } catch (e) {
    container.innerHTML =
      '<div style="padding:24px;text-align:center;color:var(--low);font-size:.8rem;">⚠️ ' +
      e.message +
      '</div>';
  }
}
