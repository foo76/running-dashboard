/**
 * widget-gct.js
 * avg30 = rolling average of gct_left_pct (e.g. 48.8 = right dominant)
 * dev   = avg30 - 50  (negative = right dominant, positive = left dominant)
 * change = last half avg - first half avg of the period
 * MAX_DEV fixed at 2.5% (±2.5% full scale)
 */

export function renderGctDial(containerId, avg30, change, days, onCycleDay) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const dev     = avg30 - 50;
  const MAX_DEV = 2.5;
  const clamped = Math.max(-MAX_DEV, Math.min(MAX_DEV, dev));

  // Main needle: right dominant (dev<0) → points right; left dominant (dev>0) → points left
  const needleAngle = -(clamped / MAX_DEV) * 90;

  const needleColour =
    Math.abs(dev) < 0.15 ? '#00E5A0' :
    dev < 0               ? '#f97316' :
                            '#3b82f6';

  const leftPct  = avg30.toFixed(1);
  const rightPct = (100 - avg30).toFixed(1);

  // ── Trend arrow geometry (sits at hub level, points left or right) ──────
  // Hub centre is at cx=120, cy=128 in the SVG viewBox (0 0 240 150)
  // Arrow is horizontal, 38px long each side of hub for double-headed stable
  const TREND_COLOUR  = '#8898BB';   // light grey matching --text2
  const TREND_LEN     = 44;          // half-length for single arrow
  const STAB_LEN      = 28;          // half-length for double-headed stable
  const HUB_X         = 120;
  const HUB_Y         = 128;
  const ARROW_Y       = HUB_Y;       // same height as hub

  const changeAbs = Math.abs(change);
  const isStable  = changeAbs < 0.05;
  // change > 0 → moving toward left → arrow points LEFT (tip on left)
  // change < 0 → moving toward right → arrow points RIGHT (tip on right)
  const goesLeft  = change > 0;

  let trendArrowSVG = '';

  if (isStable) {
    // Double-headed arrow ↔ centred on hub
    const x1 = HUB_X - STAB_LEN;
    const x2 = HUB_X + STAB_LEN;
    trendArrowSVG = `
      <!-- Trend: stable double-headed arrow -->
      <line x1="${x1}" y1="${ARROW_Y}" x2="${x2}" y2="${ARROW_Y}"
        stroke="${TREND_COLOUR}" stroke-width="2.5" stroke-linecap="round"/>
      <!-- Left arrowhead -->
      <polygon points="${x1},${ARROW_Y} ${x1+10},${ARROW_Y-5} ${x1+10},${ARROW_Y+5}"
        fill="${TREND_COLOUR}"/>
      <!-- Right arrowhead -->
      <polygon points="${x2},${ARROW_Y} ${x2-10},${ARROW_Y-5} ${x2-10},${ARROW_Y+5}"
        fill="${TREND_COLOUR}"/>
    `;
  } else if (goesLeft) {
    // Arrow points LEFT — tip on left, tail on right of hub
    const tipX  = HUB_X - TREND_LEN;
    const tailX = HUB_X + TREND_LEN;
    trendArrowSVG = `
      <!-- Trend: shifting left -->
      <line x1="${tailX}" y1="${ARROW_Y}" x2="${tipX + 10}" y2="${ARROW_Y}"
        stroke="${TREND_COLOUR}" stroke-width="2.5" stroke-linecap="round"/>
      <polygon points="${tipX},${ARROW_Y} ${tipX+10},${ARROW_Y-5} ${tipX+10},${ARROW_Y+5}"
        fill="${TREND_COLOUR}"/>
    `;
  } else {
    // Arrow points RIGHT — tip on right, tail on left of hub
    const tipX  = HUB_X + TREND_LEN;
    const tailX = HUB_X - TREND_LEN;
    trendArrowSVG = `
      <!-- Trend: shifting right -->
      <line x1="${tailX}" y1="${ARROW_Y}" x2="${tipX - 10}" y2="${ARROW_Y}"
        stroke="${TREND_COLOUR}" stroke-width="2.5" stroke-linecap="round"/>
      <polygon points="${tipX},${ARROW_Y} ${tipX-10},${ARROW_Y-5} ${tipX-10},${ARROW_Y+5}"
        fill="${TREND_COLOUR}"/>
    `;
  }

  // ── Change label for below the dial ────────────────────────────────────
  const changeSign = change >= 0 ? '+' : '';
  const changeArrow =
    isStable  ? '↔' :
    goesLeft  ? '←' : '→';
  const changeDir =
    isStable  ? 'Stable' :
    goesLeft  ? 'Left'   : 'Right';
  const changeCol =
    isStable  ? 'var(--label)' :
    goesLeft  ? '#3b82f6'      : '#f97316';

  container.innerHTML = `
    <div class="gct-dial" id="gct-dial-inner"
      style="cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;">

      <svg viewBox="0 0 240 155" width="100%" class="gct-dial-svg">
        <defs>
          <linearGradient id="gct-arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stop-color="#3b82f6" stop-opacity="0.95"/>
            <stop offset="42%"  stop-color="#1A2640" stop-opacity="0.8"/>
            <stop offset="58%"  stop-color="#1A2640" stop-opacity="0.8"/>
            <stop offset="100%" stop-color="#f97316" stop-opacity="0.95"/>
          </linearGradient>
        </defs>

        <!-- Arc track -->
        <path d="M 24 128 A 96 96 0 0 1 216 128"
          fill="none" stroke="#162033" stroke-width="18" stroke-linecap="round"/>
        <path d="M 24 128 A 96 96 0 0 1 216 128"
          fill="none" stroke="url(#gct-arc-grad)" stroke-width="18"
          stroke-linecap="round" opacity="0.75"/>

        <!-- Centre dashed guide -->
        <line x1="120" y1="34" x2="120" y2="114"
          stroke="#2E3D58" stroke-width="1.5" stroke-dasharray="5 6" opacity="0.8"/>

        <!-- LEFT / RIGHT labels -->
        <text x="10" y="22" text-anchor="start"
          class="gct-side-label gct-left-label">LEFT</text>
        <text x="230" y="22" text-anchor="end"
          class="gct-side-label gct-right-label">RIGHT</text>

        <!-- Main needle -->
        <g transform="rotate(${needleAngle}, 120, 128)">
          <line x1="120" y1="128" x2="120" y2="46"
            stroke="${needleColour}" stroke-width="3" stroke-linecap="round"/>
          <polygon points="120,34 114,52 126,52" fill="${needleColour}"/>
        </g>

        <!-- Trend arrow (drawn BEFORE hub so hub sits on top) -->
        ${trendArrowSVG}

        <!-- Hub (on top of trend arrow) -->
        <circle cx="120" cy="128" r="7" fill="${needleColour}"/>
        <circle cx="120" cy="128" r="3" fill="#0C1220"/>

        <!-- Centre deviation value -->
        <text x="120" y="100" text-anchor="middle"
          class="gct-main-value" fill="${needleColour}">
          ${Math.abs(dev).toFixed(1)}%
        </text>
      </svg>

      <!-- Dominance + split -->
      <div class="gct-dial-meta">
        <div class="gct-dominance" style="color:${needleColour}">
          ${Math.abs(dev) < 0.1 ? 'Balanced' : dev < 0 ? 'Right dominant' : 'Left dominant'}
        </div>
        <div class="gct-split">Left ${leftPct}% · Right ${rightPct}%</div>
      </div>

      <!-- Period cycle badge -->
      <div class="gct-period-badge" id="gct-period-badge">${days}d avg</div>
    </div>
  `;

  // Tap to cycle period
  document.getElementById('gct-dial-inner')
    .addEventListener('click', () => {
      if (typeof onCycleDay === 'function') onCycleDay();
    });
}
