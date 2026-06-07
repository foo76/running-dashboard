export const SB_URL = "https://krgbagjignvbnrgybdos.supabase.co";
export const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyZ2JhZ2ppZ252Ym5yZ3liZG9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjAxNjUsImV4cCI6MjA5MzgzNjE2NX0.CJLjj8rxGrgftTHoNNMSCurHEqqzh6j1aljWWJUCfg4";

export const TABS = ['wellness', 'readiness', 'volume'];
export const TAB_SUBTITLES = { 
  wellness: "Wellness Metrics", 
  readiness: "Daily Readiness Score", 
  volume: "Running Volume" 
};

// Global state shared across modules
export const state = {
  allRows: [],
  currentTab: 'wellness',
  hintShown: true,
  volLoaded: false,
  readinessRendered: false,
  hrvMode: 'last_night', // 'last_night' | 'weekly_avg'
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
  return `${h}h${String(m).padStart(2, '0')}`; 
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
  const day = dt.getDay(); // 0=Sun, 1=Mon … 6=Sat
  dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day));
  return dt;
}

// Shared Data Fetching
export async function fetchData() {
  const since = localDate(30);
  const cols = 'date,resting_hr,hrv_last_night,hrv_weekly_avg,hrv_status,sleep_score,sleep_duration_s,rem_sleep_s,deep_sleep_s,light_sleep_s,awake_s,stress_avg,updated_at';
  const url = `${SB_URL}/rest/v1/wellness_daily?select=${cols}&date=gte.${since}&order=date.asc`;
  
  const res = await fetch(url, { 
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } 
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data;
}

// Tab switching logic
export async function switchTab(tab) {
  if (tab === state.currentTab) return;
  state.currentTab = tab;
  
  const idx = TABS.indexOf(tab);
  document.getElementById('panels-slider').style.transform = `translateX(${-idx * 33.333}%)`;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById('tab-subtitle').textContent = TAB_SUBTITLES[tab];
  
  updateDots(tab);

  // Lazy load modules and render
  if (tab === 'readiness' && !state.readinessRendered && state.allRows.length) {
    const { renderReadiness } = await import('./tab-readiness.js');
    renderReadiness(state.allRows);
    state.readinessRendered = true;
  }
  if (tab === 'wellness' && state.allRows.length) {
    const { wSetRange } = await import('./tab-wellness.js');
    requestAnimationFrame(() => wSetRange(state.wActiveDay));
  }
  if (tab === 'volume' && !state.volLoaded) {
    state.volLoaded = true;
    const { fetchAndRenderVolume } = await import('./tab-volume.js');
    fetchAndRenderVolume();
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
  const hrv = parseFloat(r.hrv_last_night), hrvA = parseFloat(r.hrv_weekly_avg);
  const rhr = parseFloat(r.resting_hr), slp = parseFloat(r.sleep_score), str = parseFloat(r.stress_avg);
  
  let sHrv = 50;
  if (hrv && hrvA) {
    const ratio = hrv / hrvA;
    sHrv = ratio >= 1 ? 90 + Math.min(10, (ratio - 1) * 50) :
           ratio >= 0.9 ? 75 + (ratio - 0.9) * 150 :
           ratio >= 0.8 ? 50 + (ratio - 0.8) * 250 : ratio * 60;
  }
  
  const sSlp = slp || 50;
  const sRhr = rhr ? clamp(100 - (rhr - 45) * 2.5, 0, 100) : 50;
  const sStr = str ? clamp(100 - str, 0, 100) : 50;
  
  return {
    hrv: Math.round(sHrv),
    sleep: Math.round(sSlp),
    rhr: Math.round(sRhr),
    stress: Math.round(sStr),
    composite: Math.round(sHrv * 0.45 + sSlp * 0.25 + sRhr * 0.2 + sStr * 0.1)
  };
}
