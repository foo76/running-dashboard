/**
 * widget-gct.js
 * avg30 = rolling average of gct_left_pct (e.g. 48.8 = 48.8% left = right dominant)
 * dev = avg30 - 50
 *   dev < 0  → right dominant → needle swings RIGHT of centre
 *   dev > 0  → left dominant  → needle swings LEFT  of centre
 * MAX_DEV fixed at 2.5% (±2.5% = full scale, 5% total variance)
 */

export function renderGctDial(containerId, avg30, change, days, onCycleDay) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const dev     = avg30 - 50;           // negative = right dominant
  const MAX_DEV = 2.5;                  // fixed scale
  const clamped = Math.max(-MAX_DEV, Math.min(MAX_DEV, dev));

  // NEEDLE ANGLE:
  // dev < 0 (right dominant) → positive angle → needle points RIGHT
  // dev > 0 (left dominant)  → negative angle → needle points LEFT
  const needleAngle = -(clamped / MAX_DEV) * 90;

  const colour =
    Math.abs(dev) < 0.15 ? '#00E5A0' :
    dev < 0               ? '#f97316' :   // right dominant = orange
                            '#3b82f6';    // left dominant  = blue

  const leftPct  = avg30.toFixed(1);
  const rightPct = (100 - avg30).toFixed(1);

  // CHANGE ARROW:
  // change < 0 → balance shifting toward right → '→ Right'
  // change > 0 → balance shifting toward left  → '← Left'
  const changeAbs = Math.abs(change);
  let changeArrow, changeDir, changeColour;
  if (changeAbs < 0.05) {
    changeArrow  = '→';
    changeDir    = 'Stable';
    changeColour = 'var(--label)';
  } else if (change > 0) {
    changeArrow  = '←';
    changeDir    = 'Left';
    changeColour = '#3b82f6';
  } else {
    changeArrow  = '→';
    changeDir    = 'Right';
    changeColour = '#f97316';
  }

  const sign = change >= 0 ? '+' : '';

  container.innerHTML = `
    <div class="gct-dial" id="gct-dial-inner"
      style="cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;">

      <svg viewBox="0 0 240 150" width="100%" class="gct-dial-svg">
        <defs>
          <linearGradient id="gct-arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stop-color="#3b82f6" stop-opacity="0.95"/>
            <stop offset="42%"  stop-color="#1A2640" stop-opacity="0.8"/>
            <stop offset="58%"  stop-color="#1A2640" stop-opacity="0.8"/>
            <stop offset="100%" stop-color="#f97316" stop-opacity="0.95"/>
          </linearGradient>
        </defs>

        <!-- Arc track background -->
        <path d="M 24 128 A 96 96 0 0 1 216 128"
          fill="none" stroke="#162033" stroke-width="18" stroke-linecap="round"/>

        <!-- Arc track coloured (left=blue, right=orange) -->
        <path d="M 24 128 A 96 96 0 0 1 216 128"
          fill="none" stroke="url(#gct-arc-grad)" stroke-width="18"
          stroke-linecap="round" opacity="0.75"/>

        <!-- Centre dashed guide line -->
        <line x1="120" y1="34" x2="120" y2="114"
          stroke="#2E3D58" stroke-width="1.5"
          stroke-dasharray="5 6" opacity="0.8"/>

        <!-- LEFT / RIGHT labels -->
        <text x="10" y="22" text-anchor="start"
          class="gct-side-label gct-left-label">LEFT</text>
        <text x="230" y="22" text-anchor="end"
          class="gct-side-label gct-right-label">RIGHT</text>

        <!-- Needle (rotates around hub at 120,128) -->
        <g transform="rotate(${needleAngle}, 120, 128)">
          <line x1="120" y1="128" x2="120" y2="46"
            stroke="${colour}" stroke-width="3" stroke-linecap="round"/>
          <polygon points="120,34 114,52 126,52" fill="${colour}"/>
        </g>

        <!-- Hub -->
        <circle cx="120" cy="128" r="7" fill="${colour}"/>
        <circle cx="120" cy="128" r="3" fill="#0C1220"/>

        <!-- Centre deviation value -->
        <text x="120" y="100" text-anchor="middle"
          class="gct-main-value" fill="${colour}">
          ${Math.abs(dev).toFixed(1)}%
        </text>
      </svg>

      <!-- Dominance + split -->
      <div class="gct-dial-meta">
        <div class="gct-dominance" style="color:${colour}">
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
