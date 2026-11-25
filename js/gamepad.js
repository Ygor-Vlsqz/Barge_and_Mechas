const MAP = { toggleSuit: 0, special1: 1, drop: 2, pickup: 3, special2: 4, fire: 5, select: 8, start: 9, axisX: 0, axisY: 1 };
const DZ = 0.18, prev = {};

export function pollGamepad() {
  const gp = [...(navigator.getGamepads?.() || [])].find(g => g && g.connected);
  if (!gp) return null;
  const btn = i => !!gp.buttons[i]?.pressed;
  const edge = i => { const p = btn(i), r = p && !prev[i]; prev[i] = p; return r; };

  let ax = gp.axes[MAP.axisX] || 0, ay = gp.axes[MAP.axisY] || 0;
  const m = Math.hypot(ax, ay);
  if (m < DZ) { ax = ay = 0; } else { const k = Math.min(1, (m - DZ) / (1 - DZ)) / m; ax *= k; ay *= k; }

  const s1 = edge(MAP.special1), s2 = edge(MAP.special2);
  return {
    moveX: ax, moveY: ay, fire: btn(MAP.fire),
    toggleSuit: edge(MAP.toggleSuit), special: s1 || s2,
    drop: edge(MAP.drop), pickup: edge(MAP.pickup),
    pause: edge(MAP.start), select: edge(MAP.select)
  };
}
