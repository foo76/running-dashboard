import { state } from './shared.js';

export const loadHTML = `
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;height:60vh;text-align:center;padding:24px;">
    <span style="font-size:2.5rem">📈</span>
    <div style="font-size:1.1rem;font-weight:700;color:var(--fg)">Load</div>
    <div style="font-size:0.8rem;color:var(--dim)">In development</div>
  </div>
`;

export function renderLoad() {
  const container = document.getElementById('panel-load');
  if (container.innerHTML.trim() === '') {
    container.innerHTML = loadHTML;
  }
}
