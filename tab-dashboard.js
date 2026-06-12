import { SB_URL, SB_KEY, localDate } from './shared.js';
import { renderGctDial } from './widget-gct.js';

// ─── iOS 26 Liquid Glass card shell ───────────────────────────────────────────
export const dashboardHTML = `
  <div class="db-root">

    <!-- Ambient background glow — colour shifts with dominance -->
    <div class="db-glow" id="db-glow"></div>

    <!-- Section eyebrow -->
    <p class="db-eyebrow">Balance Analysis</p>

    <!-- Liquid Glass card -->
    <div class="db-card" id="db-card">

      <!-- Card inner: skeleton shown until data loads -->
      <div class="db-skeleton" id="db-skeleton">
        <div class="sk-arc"></div>
        <div class="sk-value"></div>
        <div class="sk-label"></div>
      </div>

      <!-- Dial mount — hidden until data ready -->
      <div class="gct-dial-wrap" id="gct-dial-wrap" style="opacity:0;transition:opacity 400ms ease;"></div>

    </div>

    <!-- Footer row: last updated -->
    <p class="db-footer" id="db-footer"></p>

  </div>
`;

// ─── Period cycle ──────────────────────────────────────────────────────────────
const CYCLES = [30, 60, 90];
let gctDayIndex = 0;

// ─── Data fetch ────────────────────────────────────────────────────────────────
async function fetchGCT(days) {
  const since = localDate(days);
  const url = `${SB_URL}/rest/v1/gct_balance_view?select=run_date,gct_left_pct` +
    `&run_date=gte.${since}&order=run_date.asc`;
  const res = await fetch(url, {
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
  });
  if (!res.ok) throw new Error(`GCT fetch failed (${res.status})`);
  return res.json();
}

function avg(arr) {
  if (!arr.length) return NaN;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// ─── Ambient glow colour tracks dominance ─────────────────────────────────────
function setGlow(dev) {
  const glow = document.getElementById('db-glow');
  if (!glow) return;
  const col =
    Math.abs(dev) < 0.15 ? '0,229,160' :
    dev < 0               ? '249,115,22' :
                            '59,130,246';
  glow.style.background =
    `radial-gradient(ellipse 70% 40% at 50% 0%, rgba(${col},0.18) 0%, transparent 70%)`;
}

// ─── Skeleton hide ─────────────────────────────────────────────────────────────
function hideSkeleton() {
  const sk   = document.getElementById('db-skeleton');
  const wrap = document.getElementById('gct-dial-wrap');
  if (sk)   { sk.style.opacity = '0'; setTimeout(() => sk.remove(), 300); }
  if (wrap) { setTimeout(() => { wrap.style.opacity = '1'; }, 120); }
}

// ─── Footer timestamp ──────────────────────────────────────────────────────────
function setFooter(rows) {
  const el = document.getElementById('db-footer');
  if (!el || !rows.length) return;
  const last = rows[rows.length - 1].run_date;
  if (!last) return;
  const d = new Date(last);
  el.textContent = `Last run  ${d.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })}`;
}

// ─── Period badge tap feedback ─────────────────────────────────────────────────
function flashBadge() {
  const badge = document.getElementById('gct-period-badge');
  if (!badge) return;
  badge.classList.add('badge-tap');
  setTimeout(() => badge.classList.remove('badge-tap'), 300);
}

// ─── Main draw ─────────────────────────────────────────────────────────────────
async function drawGct(days) {
  const wrap = document.getElementById('gct-dial-wrap');
  const rows = await fetchGCT(days);

  if (!rows?.length) {
    hideSkeleton();
    if (wrap) wrap.innerHTML = `
      <div class="db-empty">
        <span class="db-empty-icon">⚖️</span>
        <span>No GCT data available</span>
      </div>`;
    return;
  }

  const vals   = rows.map(r => parseFloat(r.gct_left_pct)).filter(v => !isNaN(v));
  if (!vals.length) return;

  const avg30  = avg(vals);
  const dev    = avg30 - 50;
  const split  = Math.ceil(vals.length / 2);
  const change = avg(vals.slice(split)) - avg(vals.slice(0, split));

  // Update ambient glow to match current dominance
  setGlow(dev);

  // Update footer
  setFooter(rows);

  // Render the dial — widget owns everything inside the card
  renderGctDial('gct-dial-wrap', avg30, change, days, () => {
    flashBadge();
    gctDayIndex = (gctDayIndex + 1) % CYCLES.length;
    drawGct(CYCLES[gctDayIndex]);
  });

  hideSkeleton();
}

// ─── Entry point ───────────────────────────────────────────────────────────────
export async function renderDashboard() {
  const container = document.getElementById('panel-dashboard');
  if (!container) return;

  container.innerHTML = dashboardHTML;
  gctDayIndex = 0;

  try {
    await drawGct(CYCLES[gctDayIndex]);
  } catch (e) {
    const wrap = document.getElementById('gct-dial-wrap');
    document.getElementById('db-skeleton')?.remove();
    if (wrap) {
      wrap.style.opacity = '1';
      wrap.innerHTML = `
        <div class="db-error">
          <span class="db-error-icon">󠀠</span>
          <span class="db-error-title">Unable to load</span>
          <span class="db-error-sub">${e.message}</span>
        </div>`;
    }
  }
}
