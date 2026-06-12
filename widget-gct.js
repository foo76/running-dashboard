export function renderGctDial(containerId, avg30) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const dev = avg30 - 50;
  const MAX_DEV = 3;
  const clamped = Math.max(-MAX_DEV, Math.min(MAX_DEV, dev));
  const fraction = clamped / MAX_DEV;

  // Positive = left dominant, negative = right dominant
  // Left side of dial = -80deg, right side = +80deg
  const needleAngle = fraction * -80;

  const colour =
    Math.abs(dev) < 0.3 ? '#00E5A0' :
    dev > 0 ? '#3b82f6' : '#f97316';

  const leftPct = avg30.toFixed(1);
  const rightPct = (100 - avg30).toFixed(1);

  container.innerHTML = `
    <div class="gct-dial">
      <svg viewBox="0 0 240 150" width="100%" class="gct-dial-svg">
        <defs>
          <linearGradient id="gct-arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.95" />
            <stop offset="45%" stop-color="#1A2640" stop-opacity="0.8" />
            <stop offset="55%" stop-color="#1A2640" stop-opacity="0.8" />
            <stop offset="100%" stop-color="#f97316" stop-opacity="0.95" />
          </linearGradient>
        </defs>

        <!-- Arc -->
        <path
          d="M 24 128 A 96 96 0 0 1 216 128"
          fill="none"
          stroke="#162033"
          stroke-width="18"
          stroke-linecap="round"
        />
        <path
          d="M 24 128 A 96 96 0 0 1 216 128"
          fill="none"
          stroke="url(#gct-arc-grad)"
          stroke-width="18"
          stroke-linecap="round"
          opacity="0.7"
        />

        <!-- Center guide -->
        <line
          x1="120"
          y1="34"
          x2="120"
          y2="128"
          stroke="#2E3D58"
          stroke-width="2"
          stroke-dasharray="6 8"
          opacity="0.9"
        />

        <!-- Needle -->
        <g transform="rotate(${needleAngle}, 120, 128)">
          <line
            x1="120"
            y1="128"
            x2="120"
            y2="46"
            stroke="${colour}"
            stroke-width="3"
            stroke-linecap="round"
          />
          <polygon
            points="120,34 114,52 126,52"
            fill="${colour}"
          />
        </g>

        <!-- Hub -->
        <circle cx="120" cy="128" r="7" fill="${colour}" />
        <circle cx="120" cy="128" r="3" fill="#0C1220" />

        <!-- Labels -->
        <text x="26" y="24" text-anchor="start" class="gct-side-label gct-left-label">LEFT</text>
        <text x="214" y="24" text-anchor="end" class="gct-side-label gct-right-label">RIGHT</text>

        <text x="26" y="48" text-anchor="start" class="gct-side-pct gct-left-label">+2%</text>
        <text x="214" y="48" text-anchor="end" class="gct-side-pct gct-right-label">+2%</text>

        <text x="120" y="98" text-anchor="middle" class="gct-main-value" fill="${colour}">
          ${Math.abs(dev).toFixed(1)}%
        </text>
      </svg>

      <div class="gct-dial-meta">
        <div class="gct-dominance" style="color:${colour}">
          ${
            Math.abs(dev) < 0.1
              ? 'Balanced'
              : dev > 0
                ? 'Left dominant'
                : 'Right dominant'
          }
        </div>
        <div class="gct-split">
          Left ${leftPct}% · Right ${rightPct}%
        </div>
      </div>
    </div>
  `;
}
