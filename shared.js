export const SB_URL = "https://krgbagjignvbnrgybdos.supabase.co";
export const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyZ2JhZ2ppZ252Ym5yZ3liZG9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjAxNjUsImV4cCI6MjA5MzgzNjE2NX0.CJLjj8rxGrgftTHoNNMSCurHEqqzh6j1aljWWJUCfg4";

export const TABS = ['dashboard', 'wellness', 'readiness', 'volume', 'load'];
export const TAB_SUBTITLES = {
  dashboard: "Dashboard",
  wellness:  "Wellness Metrics",
  readiness: "Daily Readiness Score",
  volume:    "Running Volume",
  load:      "Training Load"
};

// Global state shared across modules
export const state = {
  allRows: [],
  currentTab: 'dashboard',
  hintShown: true,
  dashboardRendered: false,
  volLoaded: false,
  loadRendered: false,
  readinessRendered: false,
  hrvMode: 'last_night',
  sleepChartMode: 'bar',
  wActiveDay: 7,
  rActiveDay: 7,
  volPeriodMonths: 3,
  volScheme: 'heat',
  volRawRows: [],
  volFetching: false,
  yoyData: null,
  yoyFetched: false,
  yoyHidden: new Set()
};

// Utility functions
export const localDate = (n = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export const hm = s => ({
  h: Math.floor(s / 3600),
  m: Math.floor((s % 3600) / 60)
});

export const hmStr = s => {
  const { h, m } = hm(s);
  return h + 'h' + String(m).padStart(2, '0');
};

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const rmSk = id => {
  const e = document.getElementById(id);
  if (e) { e.classList.remove("sk", "sk-b"); }
  return e;
};

export const fmtDate = d =>
  d.getFullYear() + '-' +
  String(d.getMonth() + 1).padStart(2, '0') + '-' +
  String(d.getDate()).padStart(2, '0');

export function getMonday(d) {
  const dt = new Date(+d);
  dt.setHours(0, 0, 0, 0);
  const day = dt.getDay();
  dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day));
  return dt;
}

// Shared Data Fetching
export async function fetchData() {
  const since = localDate(30);
  const cols = 'date,resting_hr,hrv_last_night,hrv_weekly_avg,hrv_status,sleep_score,sleep_duration_s,rem_sleep_s,deep_sleep_s,light_sleep_s,awake_s,stress_avg,updated_at';
  const url = SB_URL + '/rest/v1/wellness_daily?select=' + cols + '&date=gte.' + since + '&order=date.asc';

  const res = await fetch(url, {
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
  });
  if (!res.ok) throw new Error('API error: ' + res.status);
  return await res.json();
}

// ── Sync bottom nav active state to a tab name ──────────────
// Called after swipe gestures so the nav reflects the current panel
function syncNavToTab(tab) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tab);
  });
}

// Tab switching logic
export async function switchTab(tab) {
  if (tab === state.currentTab) return;
  state.currentTab = tab;

  const idx = TABS.indexOf(tab);
  const pct = idx * (100 / TABS.length);
  document.getElementById('panels-slider').style.transform = 'translateX(-' + pct + '%)';

  // Update subtitle
  document.getElementById('tab-subtitle').textContent = TAB_SUBTITLES[tab];

  // Sync bottom nav
  syncNavToTab(tab);

  // Update swipe dots
  updateDots(tab);

  // Hide any stray tooltips from previous tab
  ['load-tt', 're-tt'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('vis'); el.style.opacity = '0'; }
  });

  // Lazy load and render each tab
  if (tab === 'dashboard' && !state.dashboardRendered) {
    state.dashboardRendered = true;
    const { renderDashboard } = await import('./tab-dashboard.js');
    renderDashboard(state.allRows);
  }
  if (tab === 'wellness' && state.allRows.length) {
    const { renderWellness, wSetRange } = await import('./tab-wellness.js');
    const container = document.getElementById('panel-wellness');
    if (container.innerHTML.trim() === '') {
      renderWellness(state.allRows);
    } else {
      requestAnimationFrame(() => wSetRange(state.wActiveDay));
    }
  }
  if (tab === 'readiness' && !state.readinessRendered && state.allRows.length) {
    state.readinessRendered = true;
    const { renderReadiness } = await import('./tab-readiness.js');
    renderReadiness(state.allRows);
  }
  if (tab === 'volume' && !state.volLoaded) {
    state.volLoaded = true;
    const { fetchAndRenderVolume } = await import('./tab-volume.js');
    fetchAndRenderVolume();
  }
  if (tab === 'load' && !state.loadRendered) {
    state.loadRendered = true;
    const { renderLoad } = await import('./tab-load.js');
    renderLoad(state.allRows);
  }
}

export function updateDots(tab) {
  const idx = TABS.indexOf(tab);
  document.querySelectorAll('.swipe-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
}

export function hideHint() {
  if (!state.hintShown) return;
  state.hintShown = false;
  document.getElementById('swipe-hint').classList.add('hidden');
}

// Swipe detection initialization
export function initSwipe() {
  const wrap = document.getElementById('panels-wrap');
  let tx = 0, ty = 0, locked = false, cancelled = false;
  const MIN_X = 50;
  const MAX_Y = 80;

  wrap.addEventListener('touchstart', e => {
    tx = e.touches[0].clientX;
    ty = e.touches[0].clientY;
    locked = false;
    cancelled = false;
  }, { passive: true });

  wrap.addEventListener('touchmove', e => {
    if (cancelled) return;
    const dx = e.touches[0].clientX - tx;
    const dy = e.touches[0].clientY - ty;
    if (!locked) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) { cancelled = true; return; }
      if (Math.abs(dx) > 10) locked = true;
    }
    if (locked && Math.abs(dy) < MAX_Y) e.preventDefault();
  }, { passive: false });

  wrap.addEventListener('touchend', e => {
    if (cancelled || !locked) return;
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dy) >= MAX_Y) return;
    const i = TABS.indexOf(state.currentTab);
    if (dx < -MIN_X && i < TABS.length - 1) { switchTab(TABS[i + 1]); hideHint(); }
    if (dx >  MIN_X && i > 0)               { switchTab(TABS[i - 1]); hideHint(); }
  }, { passive: true });
}

// Score Calculation logic (shared by Wellness and Readiness)
export function scoreRow(r, rows) {
  const hrv  = parseFloat(r.hrv_last_night);
  const hrvA = parseFloat(r.hrv_weekly_avg);
  const rhr  = parseFloat(r.resting_hr);
  const slp  = parseFloat(r.sleep_score);
  const str  = parseFloat(r.stress_avg);

  let sHrv = 50;
  if (hrv && hrvA) {
    const ratio = hrv / hrvA;
    sHrv = ratio >= 1   ? 90 + Math.min(10, (ratio - 1) * 50) :
           ratio >= 0.9 ? 75 + (ratio - 0.9) * 150 :
           ratio >= 0.8 ? 50 + (ratio - 0.8) * 250 :
                          ratio * 60;
  }

  const sSlp = slp || 50;
  const sRhr = rhr ? clamp(100 - (rhr - 45) * 2.5, 0, 100) : 50;
  const sStr = str ? clamp(100 - str, 0, 100) : 50;

  return {
    hrv:       Math.round(sHrv),
    sleep:     Math.round(sSlp),
    rhr:       Math.round(sRhr),
    stress:    Math.round(sStr),
    composite: Math.round(sHrv * 0.45 + sSlp * 0.25 + sRhr * 0.2 + sStr * 0.1)
  };
}
