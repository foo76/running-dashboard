import { SB_URL, SB_KEY, localDate } from './shared.js';
import { renderGctDial } from './widget-gct.js';

export const dashboardHTML = `
  <div class="dash-section-title">GCT Balance</div>
  <div class="gct-card" id="gct-card">
    <div class="gct-dial-wrap" id="gct-dial-wrap"></div>
  </div>
`;

const CYCLES = [30, 60, 90];
let gctDayIndex = 0;

async function fetchGCT(days) {
  const since = localDate(days);
  const url = SB_URL + '/rest/v1/gct_balance_view?select=run_date,gct_left_pct' +
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
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

async function drawGct(days) {
  const wrap = document.getElementById('gct-dial-wrap');

  const rows = await fetchGCT(days);

  if (!rows || !rows.length) {
    if (wrap) wrap.innerHTML =
      '<div style="color:var(--label);font-size:.78rem;text-align:center;padding:24px">No GCT data</div>';
    return;
  }

  const vals = rows
    .map(r => parseFloat(r.gct_left_pct))
    .filter(v => !isNaN(v));

  if (!vals.length) return;

  const avg30 = avg(vals);

  // Change: compare first half vs second half of the period
  const split  = Math.ceil(vals.length / 2);
  const change = avg(vals.slice(split)) - avg(vals.slice(0, split));

  // widget-gct.js renders everything — dial, trend arrow, change row
  renderGctDial('gct-dial-wrap', avg30, change, days, () => {
    gctDayIndex = (gctDayIndex + 1) % CYCLES.length;
    drawGct(CYCLES[gctDayIndex]);
  });
}

export async function renderDashboard() {
  const container = document.getElementById('panel-dashboard');
  if (!container) return;

  container.innerHTML = dashboardHTML;
  gctDayIndex = 0;

  try {
    await drawGct(CYCLES[gctDayIndex]);
  } catch (e) {
    container.innerHTML =
      '<div style="padding:24px;text-align:center;color:var(--low);font-size:.8rem;">⚠️ ' +
      e.message + '</div>';
  }
}
