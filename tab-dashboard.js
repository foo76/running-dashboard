import { SB_URL, SB_KEY, localDate } from './shared.js';
import { renderGctDial } from './widget-gct.js';

// ─── Race countdown helpers (inlined — avoids broken external module) ──────────

async function fetchNextRace() {
  const today = new Date().toISOString().slice(0, 10);

  // Try future races first
  let url = `${SB_URL}/rest/v1/races` +
    `?select=race_name,race_date,distance_m,race_url,location,country` +
    `&race_date=gte.${today}` +
    `&order=race_date.asc&limit=1`;
  let res = await fetch(url, {
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
  });
  if (!res.ok) throw new Error(`Race fetch failed (${res.status})`);
  let data = await res.json();

  // Fallback: most recent past race
  if (!data?.length) {
    url = `${SB_URL}/rest/v1/races` +
      `?select=race_name,race_date,distance_m,race_url,location,country` +
      `&order=race_date.desc&limit=1`;
    res = await fetch(url, {
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
    });
    if (!res.ok) throw new Error(`Race fetch failed (${res.status})`);
    data = await res.json();
  }
  return data?.[0] ?? null;
}

function daysUntil(dateStr) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

function formatRaceDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function renderRaceCountdown(containerId, race) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!race) {
    container.innerHTML = `
      <div class="rc-empty">
        <span class="rc-empty-icon">🏁</span>
        <span>No upcoming races found</span>
      </div>`;
    return;
  }

  const days   = daysUntil(race.race_date);
  const isPast = days < 0;
  const distKm = race.distance_m ? (race.distance_m / 1000).toFixed(1) : null;
  const loc    = [race.location, race.country].filter(Boolean).join(', ');

  const accent = isPast      ? '#a78bfa' :
                 days <= 7   ? '#f97316' :
                 days <= 30  ? '#facc15' : '#00E5A0';

  const eyebrow    = isPast ? 'Most Recent Race' : 'Next Race';
  const countNum   = Math.abs(days);
  const daysLabel  = isPast
    ? (Math.abs(days) === 1 ? 'day ago' : 'days ago')
    : (days === 0 ? 'TODAY!' : 'days to go');
  const progressPct = isPast ? 100 : Math.max(2, Math.min(100, 100 - (days / 180) * 100));

  container.innerHTML = `
    <div class="rc-card${race.race_url ? ' rc-tappable' : ''}" id="rc-card-inner"
      role="${race.race_url ? 'link' : 'region'}"
      aria-label="${eyebrow}: ${race.race_name}">

      <div class="rc-top-row">
        <span class="rc-eyebrow">${eyebrow}</span>
        ${distKm ? `<span class="rc-dist-badge">${distKm}&thinsp;km</span>` : ''}
      </div>

      <h2 class="rc-name">${race.race_name}</h2>
      ${loc ? `<p class="rc-loc">📍 ${loc}</p>` : ''}

      <div class="rc-countdown-wrap">
        <div class="rc-days-number" style="color:${accent}">${countNum}</div>
        <div class="rc-days-label">${daysLabel}</div>
      </div>

      <div class="rc-divider"></div>

      <div class="rc-footer-row">
        <span class="rc-date">${formatRaceDate(race.race_date)}</span>
        ${race.race_url ? `<span class="rc-tap-hint">Tap for info ›</span>` : ''}
      </div>

      <div class="rc-progress-track">
        <div class="rc-progress-fill" style="width:${progressPct}%;background:${accent};"></div>
      </div>
    </div>`;

  if (race.race_url) {
    document.getElementById('rc-card-inner')
      .addEventListener('click', () =>
        window.open(race.race_url, '_blank', 'noopener,noreferrer'));
  }
}

// ─── Dashboard HTML shell ──────────────────────────────────────────────────────
export const dashboardHTML = `
  <div class="db-root">
    <div class="db-glow" id="db-glow"></div>
    <div id="race-countdown-mount"></div>
    <p class="db-eyebrow">Balance Analysis</p>
    <div class="db-card" id="db-card">
      <div class="db-skeleton" id="db-skeleton">
        <div class="sk-arc"></div>
        <div class="sk-value"></div>
        <div class="sk-label"></div>
      </div>
      <div class="gct-dial-wrap" id="gct-dial-wrap"
        style="opacity:0;transition:opacity 400ms ease;"></div>
    </div>
    <p class="db-footer" id="db-footer"></p>
  </div>
`;

// ─── Period cycle ──────────────────────────────────────────────────────────────
const CYCLES = [30, 60, 90];
let gctDayIndex = 0;

// ─── GCT fetch ────────────────────────────────────────────────────────────────
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

function setGlow(dev) {
  const glow = document.getElementById('db-glow');
  if (!glow) return;
  const col = Math.abs(dev) < 0.15 ? '0,229,160' :
              dev < 0 ? '249,115,22' : '59,130,246';
  glow.style.background =
    `radial-gradient(ellipse 70% 40% at 50% 0%, rgba(${col},0.18) 0%, transparent 70%)`;
}

function hideSkeleton() {
  const sk   = document.getElementById('db-skeleton');
  const wrap = document.getElementById('gct-dial-wrap');
  if (sk)   { sk.style.opacity = '0'; setTimeout(() => sk.remove(), 300); }
  if (wrap) { setTimeout(() => { wrap.style.opacity = '1'; }, 120); }
}

function showGctError(message) {
  document.getElementById('db-skeleton')?.remove();
  const wrap = document.getElementById('gct-dial-wrap');
  if (!wrap) return;
  wrap.style.opacity = '1';
  wrap.innerHTML = `
    <div class="db-error" style="padding:32px 20px;text-align:center;">
      <div style="font-size:1.4rem;margin-bottom:8px;">⚠️</div>
      <div class="db-error-title">Balance data unavailable</div>
      <div class="db-error-sub">${message}</div>
    </div>`;
}

function setFooter(rows) {
  const el = document.getElementById('db-footer');
  if (!el || !rows.length) return;
  const last = rows[rows.length - 1].run_date;
  if (!last) return;
  el.textContent = `Last run  ${new Date(last).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })}`;
}

async function drawGct(days) {
  let rows;
  try {
    rows = await fetchGCT(days);
  } catch (e) {
    showGctError(e.message);
    return;
  }

  if (!rows?.length) {
    hideSkeleton();
    const wrap = document.getElementById('gct-dial-wrap');
    if (wrap) {
      wrap.style.opacity = '1';
      wrap.innerHTML = `
        <div class="db-empty">
          <span class="db-empty-icon">⚖️</span>
          <span>No balance data for this period</span>
        </div>`;
    }
    return;
  }

  const vals   = rows.map(r => parseFloat(r.gct_left_pct)).filter(v => !isNaN(v));
  if (!vals.length) { showGctError('No valid GCT values'); return; }

  const avg30  = avg(vals);
  const dev    = avg30 - 50;
  const split  = Math.ceil(vals.length / 2);
  const change = avg(vals.slice(split)) - avg(vals.slice(0, split));

  setGlow(dev);
  setFooter(rows);

  try {
    renderGctDial('gct-dial-wrap', avg30, change, days, () => {
      const badge = document.getElementById('gct-period-badge');
      if (badge) { badge.classList.add('badge-tap'); setTimeout(() => badge.classList.remove('badge-tap'), 300); }
      gctDayIndex = (gctDayIndex + 1) % CYCLES.length;
      drawGct(CYCLES[gctDayIndex]);
    });
  } catch (e) {
    showGctError(e.message);
    return;
  }

  hideSkeleton();
}

// ─── Entry point ──────────────────────────────────────────────────────────────
export async function renderDashboard() {
  const container = document.getElementById('panel-dashboard');
  if (!container) {
    console.error('[Dashboard] panel-dashboard not found');
    return;
  }

  container.innerHTML = dashboardHTML;
  gctDayIndex = 0;

  await Promise.allSettled([
    fetchNextRace()
      .then(race => renderRaceCountdown('race-countdown-mount', race))
      .catch(e => {
        console.error('[Race countdown]', e);
        renderRaceCountdown('race-countdown-mount', null);
      }),
    drawGct(CYCLES[gctDayIndex])
  ]);
}
