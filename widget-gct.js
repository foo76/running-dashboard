/**
 * widget-gct.js
 * avg30 = rolling average of gct_left_pct (e.g. 48.8 = right dominant)
 * dev   = avg30 - 50  (negative = right dominant, positive = left dominant)
 * change = last half avg - first half avg of the period
 * MAX_DEV fixed at 2.5%
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

  // ── Change / trend values ──────────────────────────────────────────────
  const changeAbs  = Math.abs(change);
  const isStable   = changeAbs < 0.05;
  const goesLeft   = change > 0;
  const changeSign = change >= 0 ? '+' : '';

  const TREND_COLOUR = '#8898BB';

  // ── Hub geometry ───────────────────────────────────────────────────────
  const HUB_X    = 120;
  const HUB_Y    = 135;   // shifted down slightly to give room for top badge
  const ARROW_Y  = HUB_Y;
  const HALF_LEN = 44;
  const STAB_LEN = 28;

  // ── Trend arrow SVG ────────────────────────────────────────────────────
  let trendArrowSVG = '';

  if (isStable) {
    const x1 = HUB_X - STAB_LEN;
    const x2 = HUB_X + STAB_LEN;
    trendArrowSVG = `
      <line x1="${x1}" y1="${ARROW_Y}" x2="${x2}" y2="${ARROW_Y}"
        stroke="${TREND_COLOUR}" stroke-width="2.5" stroke-linecap="round"/>
      <polygon points="${x1},${ARROW_Y} ${x1+10},${ARROW_Y-5} ${x1+10},${ARROW_Y+5}"
        fill="${TREND_COLOUR}"/>
      <polygon points="${x2},${ARROW_Y} ${x2-10},${ARROW_Y-5} ${x2-10},${ARROW_Y+5}"
        fill="${TREND_COLOUR}"/>
    `;
  } else if (goesLeft) {
    const tipX = HUB_X - HALF_LEN;
    trendArrowSVG = `
      <line x1="${HUB_X}" y1="${ARROW_Y}" x2="${tipX + 10}" y2="${ARROW_Y}"
        stroke="${TREND_COLOUR}" stroke-width="2.5" stroke-linecap="round"/>
      <polygon points="${tipX},${ARROW_Y} ${tipX+10},${ARROW_Y-5} ${tipX+10},${ARROW_Y+5}"
        fill="${TREND_COLOUR}"/>
    `;
  } else {
    const tipX = HUB_X + HALF_LEN;
    trendArrowSVG = `
      <line x1="${HUB_X}" y1="${ARROW_Y}" x2="${tipX - 10}" y2="${ARROW_Y}"
        stroke="${TREND_COLOUR}" stroke-width="2.5" stroke-linecap="round"/>
      <polygon points="${tipX},${ARROW_Y} ${tipX-10},${ARROW_Y-5} ${tipX-10},${ARROW_Y+5}"
        fill="${TREND_COLOUR}"/>
    `;
  }

  // ── "Xd AVG" badge — dead centre top of SVG ───────────────────────────
  const badgeW  = 52;
  const badgeSVG = `
    <rect x="${HUB_X - badgeW/2}" y="6" width="${badgeW}" height="16"
      rx="8" fill="#0C1220" stroke="#1A2640" stroke-width="1"/>
    <text x="${HUB_X}" y="17.5" text-anchor="middle"
      font-size="8.5" font-weight="700" fill="#5A6A88"
      font-family="Satoshi,Inter,system-ui,sans-serif"
      letter-spacing="0.08em">${days}D AVG</text>
  `;

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

        <!-- "Xd AVG" badge — top centre -->
        ${badgeSVG}

        <!-- Arc track -->
        <path d="M 24 128 A 96 96 0 0 1 216 128"
          fill="none" stroke="#162033" stroke-width="18" stroke-linecap="round"/>
        <path d="M 24 128 A 96 96 0 0 1 216 128"
          fill="none" stroke="url(#gct-arc-grad)" stroke-width="18"
          stroke-linecap="round" opacity="0.75"/>

        <!-- Centre dashed guide -->
        <line x1="120" y1="28" x2="120" y2="114"
          stroke="#2E3D58" stroke-width="1.5" stroke-dasharray="5 6" opacity="0.8"/>

        <!-- LEFT / RIGHT labels -->
        <text x="10" y="38" text-anchor="start"
          class="gct-side-label gct-left-label">LEFT</text>
        <text x="230" y="38" text-anchor="end"
          class="gct-side-label gct-right-label">RIGHT</text>

        <!-- Main needle (behind hub) -->
        <g transform="rotate(${needleAngle}, ${HUB_X}, ${HUB_Y})">
          <line x1="${HUB_X}" y1="${HUB_Y}" x2="${HUB_X}" y2="50"
            stroke="${needleColour}" stroke-width="3" stroke-linecap="round"/>
          <polygon points="${HUB_X},38 ${HUB_X-6},56 ${HUB_X+6},56"
            fill="${needleColour}"/>
        </g>

        <!-- Deviation % value -->
        <text x="${HUB_X}" y="108" text-anchor="middle"
          class="gct-main-value" fill="${needleColour}">
          ${Math.abs(dev).toFixed(1)}%
        </text>

        <!-- Trend arrow (behind hub) -->
        ${trendArrowSVG}

        <!-- Hub on top of everything -->
        <circle cx="${HUB_X}" cy="${HUB_Y}" r="7" fill="${needleColour}"/>
        <circle cx="${HUB_X}" cy="${HUB_Y}" r="3" fill="#0C1220"/>

      </svg>

      <!-- Below SVG: dominance, split, change label -->
      <div class="gct-dial-meta">
        <div class="gct-dominance" style="color:${needleColour}">
          ${Math.abs(dev) < 0.1 ? 'Balanced' : dev < 0 ? 'Right dominant' : 'Left dominant'}
        </div>
        <div class="gct-split">Left ${leftPct}% · Right ${rightPct}%</div>
        <div class="gct-change-row">
          <span class="gct-change-period">${days}d Change</span>
          <span class="gct-change-val" style="color:${
            isStable ? 'var(--label)' : goesLeft ? '#3b82f6' : '#f97316'
          }">
            ${isStable ? '↔' : goesLeft ? '←' : '→'}
            ${isStable ? 'Stable' : goesLeft ? 'Left' : 'Right'}
            ${changeSign}${changeAbs.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  `;

  // Tap to cycle period
  document.getElementById('gct-dial-inner')
    .addEventListener('click', () => {
      if (typeof onCycleDay === 'function') onCycleDay();
    });
}
